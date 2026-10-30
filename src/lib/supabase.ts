import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GOOGLE_GESTURE_BLOCKED_MESSAGE, hasFreshUserGesture } from './userGesture';
import { beginGoogleRedirect, failAuthPhase, isAuthPhaseInFlight, pushAuthTrace } from './authPhase';

const SUPABASE_URL_KEY = 'spenddesk_supabase_url';
const SUPABASE_ANON_KEY = 'spenddesk_supabase_anon_key';
export const USER_STORAGE_KEY = 'money_tracker_user_info';
const LEGACY_USER_KEY = 'money_tracker_user';
const LEGACY_TOKEN_KEY = 'money_tracker_access_token';

// Default Supabase project credentials
const DEFAULT_SUPABASE_URL = 'https://nlomzcogrzaejbwnhmjx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_uuEEz0Pmx_1t9Z7_VHHJeQ_vgF5LHm2';

export const getStoredSupabaseConfig = () => {
  const url = localStorage.getItem(SUPABASE_URL_KEY) || import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = localStorage.getItem(SUPABASE_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  return { url, anonKey };
};

export const saveSupabaseConfig = (url: string, anonKey: string) => {
  if (url) localStorage.setItem(SUPABASE_URL_KEY, url.trim());
  if (anonKey) localStorage.setItem(SUPABASE_ANON_KEY, anonKey.trim());
};

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseInstance;
};

/* ---------------------------------------------------------------------------
 * AUTH STATUS (what this device believes about the sign-in)
 *
 * Persisted so a reload can tell the two very different "not signed in"
 * states apart:
 *   - signed_out: the user signed out on purpose -> local mode, no nagging.
 *   - expired:    the session died while the app was closed (long idle,
 *                 revoked refresh token) -> local mode WITH an honest banner,
 *                 because the user still expects their data to sync.
 * The old build had no such distinction: it treated a stale localStorage
 * profile as a live session, so the app looked signed in while every cloud
 * write silently failed.
 * ------------------------------------------------------------------------ */
export type AuthStatus = 'signed_in' | 'signed_out' | 'expired';

const AUTH_STATUS_KEY = 'spenddesk_auth_status_v2';

export const readAuthStatus = (): AuthStatus => {
  try {
    const raw = localStorage.getItem(AUTH_STATUS_KEY);
    if (raw === 'signed_in' || raw === 'signed_out' || raw === 'expired') return raw;
  } catch {}
  return 'signed_out';
};

/**
 * Same lookup, but null when this device has NEVER recorded a status.
 * A first-time visitor was not "signed out" — only this distinction keeps the
 * sign-in page from greeting a brand-new user with a sign-out notice.
 */
export const peekAuthStatus = (): AuthStatus | null => {
  try {
    const raw = localStorage.getItem(AUTH_STATUS_KEY);
    if (raw === 'signed_in' || raw === 'signed_out' || raw === 'expired') return raw;
  } catch {}
  return null;
};

export const writeAuthStatus = (status: AuthStatus): void => {
  try {
    localStorage.setItem(AUTH_STATUS_KEY, status);
  } catch {}
};

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  errorMessage?: string;
}

/**
 * Sign in with Google using Supabase OAuth
 */
export const signInWithGoogleSupabase = async (caller = 'Sign-in button'): Promise<AuthResult> => {
  // Hard gate: Google's sign-in / account-chooser screen may only ever open
  // because a human just tapped in SpendDesk. Background renewal, sheet sync
  // and boot-restore paths reach this function too, so without this check they
  // would navigate the tab away to Google on their own after the token expired.
  if (!hasFreshUserGesture()) {
    console.warn('Google sign-in blocked: no recent user gesture (background caller).');
    pushAuthTrace('oauth_blocked_no_gesture', { caller });
    return { success: false, errorMessage: GOOGLE_GESTURE_BLOCKED_MESSAGE };
  }
  if (isAuthPhaseInFlight()) {
    pushAuthTrace('oauth_ignored_duplicate', { caller });
    return { success: true };
  }
  try {
    const supabase = getSupabase();
    // Dynamic redirect URL to ensure user stays on the exact current website domain (Live site vs Localhost)
    const currentOrigin = window.location.origin;
    const cleanPath = window.location.pathname.replace(/\/?[^/]*\.[^/]+$/, '');
    const redirectUrl = `${currentOrigin}${cleanPath}`.replace(/\/+$/, '') + '/';

    // Show the connecting overlay immediately — before Google's URL is ready —
    // so the tap is acknowledged. OAuth options below are unchanged.
    beginGoogleRedirect(caller);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          // `consent` is REQUIRED for this app to stay signed in. Google only
          // issues an offline refresh token when it shows the consent screen;
          // with select_account alone, an already-granted account silently
          // approves WITHOUT one, so nothing could be stored in
          // google_refresh_tokens and the server mint ran dry ~1h later -
          // every sign-in bought only an hour before "Reconnect Google"
          // reappeared. The space-delimited list keeps the account chooser and
          // forces the consent that produces the refresh token, which is what
          // makes "sign in once, stay connected for months" possible.
          prompt: 'consent select_account',
          enable_granular_consent: 'false',
          include_granted_scopes: 'true',
        },
      },
    });

    if (error) {
      console.error('Supabase OAuth Error:', error);
      failAuthPhase(error.message);
      return {
        success: false,
        errorMessage: error.message,
      };
    }

    if (data?.url) {
      pushAuthTrace('oauth_navigate', { caller });
      window.location.href = data.url;
      return { success: true };
    }

    failAuthPhase('We could not open Google sign-in. Please try again.');
    return { success: false, errorMessage: 'We could not open Google sign-in. Please try again.' };
  } catch (err: any) {
    console.error('Supabase Sign-In Exception:', err);
    const errorMessage = err?.message || 'Failed to initialize Supabase Google Sign-In';
    failAuthPhase(errorMessage);
    return {
      success: false,
      errorMessage,
    };
  }
};

/* ---------------------------------------------------------------------------
 * EMAIL + PASSWORD AUTH
 *
 * Google remains the front door; email/password is the second door that makes
 * two things possible that OAuth alone cannot do: creating an account without
 * Google, and recovering a forgotten password (Supabase emails a reset link
 * straight to the inbox).
 * ------------------------------------------------------------------------ */

export interface PasswordAuthResult {
  success: boolean;
  /** Human-readable, already suitable for showing under the form. */
  message?: string;
  /** Sign-up only: the account exists but the inbox still has to confirm it. */
  needsConfirmation?: boolean;
  email?: string;
}

/** Turns Supabase's terse auth errors into copy the user can act on. */
const friendlyAuthMessage = (raw: string): string => {
  const m = (raw || '').toLowerCase();
  if (m.includes('is invalid') && m.includes('email'))
    return "That email address doesn't look right — check it and try again.";
  if (m.includes('invalid login credentials'))
    return 'Email or password is incorrect. If you usually sign in with Google, use Continue with Google instead.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'This email already has an account — tap Sign In instead.';
  if (m.includes('at least 6')) return 'Password must be at least 6 characters.';
  if (m.includes('email not confirmed'))
    return 'Confirm your email first — open the link we sent you, then sign in.';
  if (m.includes('signups not allowed') || m.includes('sign up is disabled'))
    return 'Creating new accounts is turned off for this project.';
  if (m.includes('only request this after') || m.includes('rate limit'))
    return 'Too many attempts. Wait a minute, then try again.';
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'You are offline. Reconnect and try again.';
  return raw || 'Something went wrong. Please try again.';
};

/** The same return URL Google OAuth uses, so every flow lands back on the app. */
const appRedirectUrl = (): string => {
  const currentOrigin = window.location.origin;
  const cleanPath = window.location.pathname.replace(/\/?[^/]*\.[^/]+$/, '');
  return `${currentOrigin}${cleanPath}`.replace(/\/+$/, '') + '/';
};

export const signInWithPasswordSupabase = async (
  email: string,
  password: string,
): Promise<PasswordAuthResult> => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      pushAuthTrace('password_signin_failed', { reason: error.message });
      return { success: false, message: friendlyAuthMessage(error.message) };
    }
    pushAuthTrace('password_signin_ok', { account: data.user?.email });
    return { success: true, email: data.user?.email };
  } catch (e: any) {
    return { success: false, message: friendlyAuthMessage(e?.message || 'Failed to fetch') };
  }
};

export const signUpWithPasswordSupabase = async (
  email: string,
  password: string,
  fullName?: string,
): Promise<PasswordAuthResult> => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: fullName ? { data: { full_name: fullName } } : undefined,
    });
    if (error) {
      pushAuthTrace('password_signup_failed', { reason: error.message });
      return { success: false, message: friendlyAuthMessage(error.message) };
    }
    // Email confirmation on -> no session yet, the inbox has to confirm first.
    // Confirmation off -> the session is live and the app can go straight in.
    const needsConfirmation = !data.session;
    pushAuthTrace('password_signup_ok', { account: email, needsConfirmation });
    return {
      success: true,
      needsConfirmation,
      email: email.trim(),
      message: needsConfirmation
        ? `Check your inbox — we sent a confirmation link to ${email.trim()}.`
        : undefined,
    };
  } catch (e: any) {
    return { success: false, message: friendlyAuthMessage(e?.message || 'Failed to fetch') };
  }
};

/** Sends Supabase's password-reset email (the template lives in the dashboard). */
export const sendPasswordResetSupabase = async (email: string): Promise<PasswordAuthResult> => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appRedirectUrl(),
    });
    if (error) {
      pushAuthTrace('password_reset_failed', { reason: error.message });
      return { success: false, message: friendlyAuthMessage(error.message) };
    }
    pushAuthTrace('password_reset_sent', {});
    return { success: true, email: email.trim() };
  } catch (e: any) {
    return { success: false, message: friendlyAuthMessage(e?.message || 'Failed to fetch') };
  }
};

/** Sets the new password for the recovery session the emailed link opens. */
export const setNewPasswordSupabase = async (password: string): Promise<PasswordAuthResult> => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      pushAuthTrace('password_update_failed', { reason: error.message });
      return { success: false, message: friendlyAuthMessage(error.message) };
    }
    pushAuthTrace('password_updated', {});
    return { success: true };
  } catch (e: any) {
    return { success: false, message: friendlyAuthMessage(e?.message || 'Failed to fetch') };
  }
};

/**
 * Store Google's offline refresh token server-side (RLS-scoped, one row per
 * user) so the `sheets-token` edge function can mint fresh Sheets/Drive access
 * tokens with ZERO Google UI - no popup, no redirect, ever. This is what makes
 * "sign in once, stay signed in for months" possible: the browser never needs
 * to talk to Google again after the initial consent.
 */
export const persistProviderRefreshToken = (userId: string, refreshToken?: string | null): void => {
  if (!userId || !refreshToken || refreshToken.length < 10) return;
  try {
    const supabase = getSupabase();
    void supabase
      .from('google_refresh_tokens')
      .upsert(
        { user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .then(
        ({ error }) => {
          if (error) {
            // Table not migrated yet (or offline) - the token mint simply
            // falls back to the interactive path.
            pushAuthTrace('google_refresh_token_store_failed', { reason: error.message });
          } else {
            pushAuthTrace('google_refresh_token_stored', {});
          }
        },
        () => {}
      );
  } catch {}
};

/**
 * Sign out user - COMPLETE sign-out.
 *
 * Drops every credential this device holds for the account:
 *   1. the Google offline refresh token row (server side, RLS-scoped),
 *   2. the Supabase session (this device only),
 *   3. the cached Google access token + the legacy token/profile keys.
 *
 * The account's own DATA (transactions, settings, sheet link) is NOT touched:
 * it stays under the account-scoped localStorage keys and becomes the
 * baseline for the next sign-in.
 */
export const signOutSupabase = async (): Promise<void> => {
  markExplicitSignOut();
  try {
    const supabase = getSupabase();
    // Drop the stored Google refresh token FIRST (while our session JWT is
    // still valid, so RLS lets us delete our own row): signing out must fully
    // disconnect Google, not leave a live credential behind on the server.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await supabase.from('google_refresh_tokens').delete().eq('user_id', session.user.id);
        pushAuthTrace('google_refresh_token_deleted', {});
      }
    } catch {}
    // Default Supabase sign-out revokes every session for this account. SpendDesk
    // deliberately signs out this browser/device only; other signed-in devices
    // keep their own active session and continue receiving realtime updates.
    await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.warn('Signout warning:', e);
  }
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {}
  writeAuthStatus('signed_out');
};

/* ---------------------------------------------------------------------------
 * THE SINGLE AUTH LISTENER
 *
 * One authority for "is anybody signed in": the Supabase session.
 *
 * The old build had two parallel listeners - a localStorage-driven one that
 * restored a profile as "signed in" and a session-driven one - so a stale
 * profile could win over a dead session (the app looked connected while every
 * cloud write failed). Now the session decides, always:
 *
 *   onSignedIn(account, { providerToken })  - a live session exists.
 *   onSignedOut('boot')                     - no session at boot.
 *   onSignedOut('session_lost')             - the session died while running.
 *   onSignedOut('signed_out')               - the user signed out on purpose.
 * ------------------------------------------------------------------------ */

export interface AuthAccount {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthListenerHandlers {
  onSignedIn: (account: AuthAccount, ctx: { providerToken: string | null }) => void;
  onSignedOut: (reason: 'boot' | 'signed_out' | 'session_lost') => void;
}

/**
 * True while WE are the ones signing out, so the SIGNED_OUT event is not
 * mistaken for a lost session.
 *
 * The Supabase client fires the event asynchronously, so the flag cannot be
 * cleared the moment `signOut()` resolves - it is cleared when the event
 * arrives, or by a safety timeout in case the event never comes.
 *
 * The intent is ALSO written to localStorage: a second tab of the same
 * browser sees the session disappear too, and it must know that the user
 * deliberately signed out (else it would mark the device as "expired" and
 * nag about a session that was ended on purpose).
 */
let explicitSignOut = false;
let explicitSignOutTimer: ReturnType<typeof setTimeout> | null = null;
const SIGN_OUT_INTENT_KEY = 'spenddesk_signout_intent';
const SIGN_OUT_INTENT_TTL_MS = 15_000;

const markExplicitSignOut = (): void => {
  explicitSignOut = true;
  try { localStorage.setItem(SIGN_OUT_INTENT_KEY, String(Date.now())); } catch {}
  if (explicitSignOutTimer) clearTimeout(explicitSignOutTimer);
  explicitSignOutTimer = setTimeout(() => {
    explicitSignOut = false;
    explicitSignOutTimer = null;
  }, 8000);
};

const consumeExplicitSignOut = (): boolean => {
  if (explicitSignOut) {
    explicitSignOut = false;
    if (explicitSignOutTimer) {
      clearTimeout(explicitSignOutTimer);
      explicitSignOutTimer = null;
    }
    return true;
  }
  // Another tab of this browser signed out. The session is gone for both
  // tabs, but the user ended it on purpose - so it is NOT an expired
  // session. The marker expires on its own, so a later genuine session loss
  // is still reported honestly.
  try {
    const raw = localStorage.getItem(SIGN_OUT_INTENT_KEY);
    const at = raw ? parseInt(raw, 10) : 0;
    if (at && Date.now() - at < SIGN_OUT_INTENT_TTL_MS) return true;
  } catch {}
  return false;
};

export const initAuthListener = (handlers: AuthListenerHandlers): (() => void) => {
  const supabase = getSupabase();
  let settled = false;

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user;
    if (user) {
      settled = true;
      const account: AuthAccount = {
        id: user.id,
        email: (user.email || '').trim().toLowerCase(),
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'Google User',
        picture: user.user_metadata?.avatar_url || user.user_metadata?.picture || undefined,
      };

      // Hand Google's offline refresh token to our backend once, so all future
      // token needs are answered server-side with no Google UI. Deferred by a
      // tick: this runs inside the auth callback and must not touch the client
      // synchronously.
      if (session?.provider_refresh_token) {
        const refreshToken = session.provider_refresh_token;
        setTimeout(() => persistProviderRefreshToken(user.id, refreshToken), 0);
      }

      writeAuthStatus('signed_in');
      pushAuthTrace('auth_signed_in', { account: account.email, event });
      handlers.onSignedIn(account, { providerToken: session?.provider_token || null });
      return;
    }

    // No session.
    if (!settled) {
      // FIRST event of this client instance = the boot snapshot.
      settled = true;
      pushAuthTrace('auth_boot_no_session', { event });
      handlers.onSignedOut('boot');
      return;
    }

    const reason = consumeExplicitSignOut() ? 'signed_out' : 'session_lost';
    pushAuthTrace('auth_signed_out', { event, reason });
    handlers.onSignedOut(reason);
  });

  return () => subscription.unsubscribe();
};
