import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { GOOGLE_GESTURE_BLOCKED_MESSAGE, hasFreshUserGesture } from './userGesture';
import { beginGoogleRedirect, pushAuthTrace } from './authPhase';

const SUPABASE_URL_KEY = 'spenddesk_supabase_url';
const SUPABASE_ANON_KEY = 'spenddesk_supabase_anon_key';
const USER_STORAGE_KEY = 'money_tracker_user_info';
const TOKEN_STORAGE_KEY = 'money_tracker_access_token';

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
  try {
    const supabase = getSupabase();
    // Dynamic redirect URL to ensure user stays on the exact current website domain (Live site vs Localhost)
    const currentOrigin = window.location.origin;
    const cleanPath = window.location.pathname.replace(/\/?[^/]*\.[^/]+$/, '');
    const redirectUrl = `${currentOrigin}${cleanPath}`.replace(/\/+$/, '') + '/';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
          enable_granular_consent: 'false',
          include_granted_scopes: 'true',
        },
      },
    });

    if (error) {
      console.error('Supabase OAuth Error:', error);
      return {
        success: false,
        errorMessage: error.message,
      };
    }

    if (data?.url) {
      // Mark the round-trip in-flight BEFORE leaving: the overlay shows
      // "Redirecting to Google…" with the caller as the cause, and the return
      // trip flips straight into "Completing sign-in…" instead of a blank boot.
      beginGoogleRedirect(caller);
      pushAuthTrace('oauth_navigate', { caller });
      window.location.href = data.url;
    }

    return { success: true };
  } catch (err: any) {
    console.error('Supabase Sign-In Exception:', err);
    return {
      success: false,
      errorMessage: err?.message || 'Failed to initialize Supabase Google Sign-In',
    };
  }
};

/**
 * Sign in with Email & Password
 */
export const signInWithEmailSupabase = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, errorMessage: error.message };
    }
    const u = data.user;
    const userObj = {
      id: u?.id || '',
      email: u?.email || '',
      name: u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'User',
      picture: u?.user_metadata?.avatar_url || null,
    };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userObj));
    localStorage.setItem('money_tracker_user', JSON.stringify({ displayName: userObj.name, email: userObj.email, photoURL: userObj.picture }));
    window.dispatchEvent(new CustomEvent('spenddesk_google_auth', { detail: { user: userObj, token: 'local_token' } }));
    return { success: true, user: userObj };
  } catch (err: any) {
    return { success: false, errorMessage: err.message };
  }
};

/**
 * Sign Up with Email & Password
 */
export const signUpWithEmailSupabase = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.href,
      },
    });
    if (error) {
      return { success: false, errorMessage: error.message };
    }
    const u = data.user;
    const userObj = {
      id: u?.id || '',
      email: u?.email || '',
      name: u?.user_metadata?.full_name || u?.email?.split('@')[0] || 'User',
      picture: u?.user_metadata?.avatar_url || null,
    };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userObj));
    localStorage.setItem('money_tracker_user', JSON.stringify({ displayName: userObj.name, email: userObj.email, photoURL: userObj.picture }));
    window.dispatchEvent(new CustomEvent('spenddesk_google_auth', { detail: { user: userObj, token: 'local_token' } }));
    return { success: true, user: userObj };
  } catch (err: any) {
    return { success: false, errorMessage: err.message };
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
            // Table not migrated yet (or offline) - GIS fallback still covers us.
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
 * Sign out user
 */
export const signOutSupabase = async () => {
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
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};

/**
 * Auth state listener
 */
export const initSupabaseAuth = (
  onAuthSuccess?: (user: { displayName: string; email: string; photoURL?: string }, token: string) => void,
  onAuthFailure?: () => void
) => {
  const supabase = getSupabase();

  // If provider_token is directly in the URL hash, capture it
  if (typeof window !== 'undefined' && window.location.hash) {
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const pToken = hashParams.get('provider_token');
      if (pToken) {
        localStorage.setItem(TOKEN_STORAGE_KEY, pToken);
        localStorage.setItem('spenddesk_google_token', pToken);
        localStorage.setItem('spenddesk_token_expires_at', String(Date.now() + 3540 * 1000));
      }
    } catch {}
  }

  // Check current session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      const u = session.user;
      const userInfo = {
        displayName: u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
        email: u.email || '',
        photoURL: u.user_metadata?.avatar_url || undefined,
      };
      if (session.provider_token) {
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, session.provider_token);
          localStorage.setItem('spenddesk_google_token', session.provider_token);
          localStorage.setItem('spenddesk_token_expires_at', String(Date.now() + 3540 * 1000));
        } catch {}
      }
      // P2s: hand Google's offline refresh token to our backend once, so all
      // future token needs are answered server-side with no Google UI.
      if (session.provider_refresh_token) {
        persistProviderRefreshToken(session.user.id, session.provider_refresh_token);
      }
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
          id: u.id,
          name: userInfo.displayName,
          email: userInfo.email,
          picture: userInfo.photoURL,
        }));
        localStorage.setItem('money_tracker_user', JSON.stringify(userInfo));
      } catch {}
      const storedToken = localStorage.getItem('spenddesk_google_token') || localStorage.getItem(TOKEN_STORAGE_KEY);
      const tokenToUse = session.provider_token || (storedToken && !storedToken.startsWith('eyJ') ? storedToken : session.access_token);
      if (onAuthSuccess) onAuthSuccess(userInfo, tokenToUse);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      const u = session.user;
      const userInfo = {
        displayName: u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
        email: u.email || '',
        photoURL: u.user_metadata?.avatar_url || undefined,
      };
      if (session.provider_token) {
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, session.provider_token);
          localStorage.setItem('spenddesk_google_token', session.provider_token);
          localStorage.setItem('spenddesk_token_expires_at', String(Date.now() + 3540 * 1000));
        } catch {}
      }
      // P2s: hand Google's offline refresh token to our backend once, so all
      // future token needs are answered server-side with no Google UI.
      if (session.provider_refresh_token) {
        persistProviderRefreshToken(session.user.id, session.provider_refresh_token);
      }
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
          id: u.id,
          name: userInfo.displayName,
          email: userInfo.email,
          picture: userInfo.photoURL,
        }));
        localStorage.setItem('money_tracker_user', JSON.stringify(userInfo));
      } catch {}
      const storedToken = localStorage.getItem('spenddesk_google_token') || localStorage.getItem(TOKEN_STORAGE_KEY);
      const tokenToUse = session.provider_token || (storedToken && !storedToken.startsWith('eyJ') ? storedToken : session.access_token);
      if (onAuthSuccess) onAuthSuccess(userInfo, tokenToUse);
    } else if (event === 'SIGNED_OUT') {
      if (onAuthFailure) onAuthFailure();
    }
  });

  return () => {
    subscription.unsubscribe();
  };
};

