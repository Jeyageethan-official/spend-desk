import { getSupabase, signInWithGoogleSupabase, signOutSupabase } from './supabase';
import { pushAuthTrace } from './authPhase';
import { fetchSheetsTokenFromServer, clearServerSheetsToken } from './sheetsToken';

// OAuth web client that Supabase uses for Google sign-in (project 377806164433).
// It already holds the user's grant for the Sheets/Drive scopes from the login
// consent. Background renewal NEVER talks to Google from the browser: Google
// Identity Services opens a real window on every requestAccessToken call - even
// with prompt:'none' - so the client-side GIS renewal path was removed entirely.
// All renewal runs through our backend (the `sheets-token` edge function trades
// the stored offline refresh token for a fresh access token, zero Google UI),
// which keeps the app signed in after any amount of idle time with no popup and
// no redirect, ever. Interactive Google sign-in (a full redirect) only happens
// on an explicit user tap when there is no working token left.
export const GOOGLE_OAUTH_CLIENT_ID = '377806164433-ftqbide3ul9jfenp00hcgveeonoifdjs.apps.googleusercontent.com';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const GOOGLE_TOKEN_KEY = 'spenddesk_google_token';
const TOKEN_EXPIRY_KEY = 'spenddesk_token_expires_at';
/** Which Google account the cached token belongs to. */
const GOOGLE_TOKEN_EMAIL_KEY = 'spenddesk_google_token_email';
/** Legacy duplicates that older builds wrote. Never read, always cleaned. */
const LEGACY_TOKEN_KEY = 'money_tracker_access_token';
const LEGACY_LOGIN_HINT_KEY = 'spenddesk_google_login_hint';

let cachedAccessToken: string | null = null;
let silentRefreshPromise: Promise<string | null> | null = null;
let interactiveAuthPromise: Promise<{ user: WorkspaceUser; accessToken: string }> | null = null;

/**
 * The Google account that currently owns this device's Google credentials.
 *
 * The Supabase session is the only authority on "is anybody signed in", so the
 * Google token follows the session: it is only handed out while a session for
 * that exact account is live. Without this binding a token left over from an
 * earlier session (or from another Google account on the same device) would be
 * picked up on the next sign-in - the app would look connected and every
 * Google call would fail with 401.
 */
let currentAccountEmail: string | null = null;

export const setCurrentWorkspaceAccount = (email?: string | null): void => {
  currentAccountEmail = email && email.trim() ? email.trim().toLowerCase() : null;
};

export const getCurrentWorkspaceAccount = (): string | null => currentAccountEmail;

export interface WorkspaceUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Is the cached Google token expired?
 *
 * DEFAULT-EXPIRED on purpose: a token without a recorded expiry cannot be
 * trusted (the old build treated "no expiry stored" as "not expired", so a
 * months-old access token was happily used until Google answered 401).
 */
export const isGoogleTokenExpired = (): boolean => {
  try {
    const expiresAtStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiresAtStr) return true;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (!Number.isFinite(expiresAt)) return true;
    // Buffer of 60 seconds before actual expiry
    return Date.now() >= expiresAt - 60000;
  } catch {
    return true;
  }
};

/**
 * The cached Google access token - but ONLY for the account that owns it.
 *
 * A token without a recorded owner is not trusted: that is the leftover of a
 * dead session (the exact state that used to make the app look signed in
 * while nothing synced). The token is re-minted from the server instead.
 */
export const getCachedWorkspaceToken = (): string | null => {
  const owner = (() => {
    try { return (localStorage.getItem(GOOGLE_TOKEN_EMAIL_KEY) || '').trim().toLowerCase(); } catch { return ''; }
  })();
  if (!owner || !currentAccountEmail || owner !== currentAccountEmail) {
    cachedAccessToken = null;
    return null;
  }
  if (cachedAccessToken && !cachedAccessToken.startsWith('eyJ') && cachedAccessToken.length > 20) {
    return cachedAccessToken;
  }
  try {
    const stored = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (stored && !stored.startsWith('eyJ') && stored.length > 20) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
};

export const setCachedWorkspaceToken = (
  token: string | null,
  expiresInSeconds?: number,
  email?: string | null
) => {
  const owner = (email || currentAccountEmail || '').trim().toLowerCase();
  if (token && !token.startsWith('eyJ') && token.length > 20) {
    cachedAccessToken = token;
    const duration = expiresInSeconds && expiresInSeconds > 60 ? expiresInSeconds : 3540;
    const expiresAt = Date.now() + duration * 1000;
    try {
      localStorage.setItem(GOOGLE_TOKEN_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
      if (owner) localStorage.setItem(GOOGLE_TOKEN_EMAIL_KEY, owner);
    } catch {}
  } else if (!token) {
    cachedAccessToken = null;
    try {
      localStorage.removeItem(GOOGLE_TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      localStorage.removeItem(GOOGLE_TOKEN_EMAIL_KEY);
    } catch {}
  }
};

/**
 * Drop EVERY trace of the Google credentials held on this device:
 * the cached access token, the in-memory copy, the server-minted token cache
 * and the legacy duplicates older builds wrote.
 *
 * Called on sign-out and whenever the account changes, so one account can
 * never be served another account's Google token.
 */
export const clearWorkspaceTokenState = (): void => {
  cachedAccessToken = null;
  clearServerSheetsToken();
  currentAccountEmail = null;
  try {
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_EMAIL_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_LOGIN_HINT_KEY);
  } catch {}
};

/**
 * Silent Google token renewal (no user popup, no redirect).
 *
 * Ladder:
 *   1. a still-valid cached token - cheapest answer,
 *   2. the provider token that came with the sign-in exchange (~1h),
 *   3. the backend mint from the stored offline refresh token (the real
 *      "stay signed in for months" path - zero Google UI),
 *   4. nothing.
 *
 * Step 4 returns null on purpose. Handing back a stale token would make the
 * app look connected while every Google call fails with 401.
 */
export const refreshGoogleTokenSilently = async (
  userEmail?: string,
  caller = 'background'
): Promise<string | null> => {
  const account = (userEmail || currentAccountEmail || '').trim().toLowerCase();
  // A Google token is only ever minted for the account that owns this device.
  if (userEmail && currentAccountEmail && account !== currentAccountEmail) {
    pushAuthTrace('silent_refresh_wrong_account', { caller, account });
    return null;
  }
  if (silentRefreshPromise) return silentRefreshPromise;

  silentRefreshPromise = (async () => {
    pushAuthTrace('silent_refresh_start', { caller, account });

    // 1. A still-valid cached token is the best refresh - reuse it. It is
    //    only handed out when it belongs to the account that is signed in.
    const cached = getCachedWorkspaceToken();
    if (cached && !isGoogleTokenExpired()) return cached;

    // 2. Supabase keeps the Google provider token from the sign-in exchange.
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const providerToken = session?.provider_token;
      if (providerToken && !providerToken.startsWith('eyJ') && providerToken.length > 20) {
        setCachedWorkspaceToken(providerToken, undefined, account);
        return providerToken;
      }
    } catch {}

    // 3. BACKEND REFRESH: our `sheets-token` edge function trades Google's
    //    stored offline refresh token for a fresh access token. No Google UI
    //    at all - no popup, no redirect, no gesture.
    try {
      const fromServer = await fetchSheetsTokenFromServer();
      if (fromServer?.token) {
        setCachedWorkspaceToken(fromServer.token, fromServer.expiresInSeconds, account);
        return fromServer.token;
      }
    } catch {}

    // 4. Nothing usable. The client-side Google Identity Services renewal
    //    path was removed on purpose: GIS calls window.open() on the OAuth
    //    endpoint on EVERY requestAccessToken (even with prompt:'none'), so
    //    any client-side renewal is a popup by definition. An explicit user
    //    tap is the only path that can ever start a re-auth redirect.
    pushAuthTrace('silent_refresh_no_token', { caller });
    return null;
  })().finally(() => {
    silentRefreshPromise = null;
  });

  return silentRefreshPromise;
};

/**
 * Fetch Google User Info using OAuth access token
 */
export const fetchGoogleUserInfo = async (accessToken: string): Promise<{
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}> => {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch Google user profile.');
  }
  return await res.json();
};

/**
 * Single Sign-In with Google via Supabase OAuth.
 * Performs a single clean redirect displaying the user's Gmail account chooser list.
 */
export const signInWithGoogleWorkspace = async (
  caller = 'Connect Google button'
): Promise<{ user: WorkspaceUser; accessToken: string }> => {
  if (interactiveAuthPromise) {
    return interactiveAuthPromise;
  }

  interactiveAuthPromise = (async () => {
    const res = await signInWithGoogleSupabase(caller);
    if (!res.success && res.errorMessage) {
      throw new Error(res.errorMessage);
    }
    // Redirect is in progress
    return new Promise<{ user: WorkspaceUser; accessToken: string }>(() => {});
  })().finally(() => {
    interactiveAuthPromise = null;
  });

  return interactiveAuthPromise;
};

/**
 * FULL SIGN-IN RESET.
 *
 * Wipes the sign-in state of this device so the next sign-in starts from a
 * clean slate (useful when the app is stuck in a half-signed-in state):
 * the Supabase session, Google's offline refresh token, every cached access
 * token and the stored profile are removed.
 *
 * The account's own DATA (transactions, lends, settings, sheet link) is kept
 * - it stays under the account-scoped localStorage keys and is restored on the
 * next sign-in.
 */
export const resetSignIn = async (): Promise<void> => {
  try {
    await signOutSupabase();
  } catch {}
  clearWorkspaceTokenState();
  try {
    localStorage.removeItem('money_tracker_user');
    localStorage.removeItem('money_tracker_user_info');
  } catch {}
  pushAuthTrace('signin_reset', {});
};
