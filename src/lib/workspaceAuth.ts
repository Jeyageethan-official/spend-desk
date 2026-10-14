import { getSupabase, signInWithGoogleSupabase } from './supabase';
import { hasFreshUserGesture } from './userGesture';

// OAuth web client that Supabase uses for Google sign-in (project 377806164433).
// It already holds the user's grant for the Sheets/Drive scopes from the login
// consent, so background renewal uses prompt:'none' - Google is FORCED to stay
// fully silent: no popup, no account chooser, no consent screen, ever. When a
// silent renewal is not possible Google returns an error to the callback
// instead of showing UI, and we fall back to the cached token. Interactive
// re-auth only ever happens on an explicit user tap. (The old 5093... client
// had no grant and no authorized JavaScript origins, which caused Google's
// "Error 400: origin_mismatch".)
export const GOOGLE_OAUTH_CLIENT_ID = '377806164433-ftqbide3ul9jfenp00hcgveeonoifdjs.apps.googleusercontent.com';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const TOKEN_KEY = 'money_tracker_access_token';
const GOOGLE_TOKEN_KEY = 'spenddesk_google_token';
const TOKEN_EXPIRY_KEY = 'spenddesk_token_expires_at';
const USER_STORAGE_KEY = 'money_tracker_user_info';
const LOGIN_HINT_KEY = 'spenddesk_google_login_hint';

let cachedAccessToken: string | null = null;
let silentRefreshPromise: Promise<string | null> | null = null;
let interactiveAuthPromise: Promise<{ user: WorkspaceUser; accessToken: string }> | null = null;

const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GSI_BLOCK_KEY = 'spenddesk_gsi_origin_blocked_at';
let gsiLoadPromise: Promise<boolean> | null = null;
let gsiTokenClient: any = null;
let gsiLastErrorType: string | null = null;

/**
 * True when a recent GIS attempt failed with origin_mismatch/invalid_client:
 * this page's origin is not in the OAuth client's "Authorized JavaScript
 * origins". Retrying would only flash Google's blocked screen again, so the
 * flag stops background attempts for a while (self-heals after 2 hours in
 * case the console configuration was fixed meanwhile).
 */
const isGsiOriginBlocked = (): boolean => {
  try {
    const at = Number(localStorage.getItem(GSI_BLOCK_KEY) || '0');
    return Boolean(at) && Date.now() - at < 2 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const markGsiOriginBlocked = () => {
  try {
    localStorage.setItem(GSI_BLOCK_KEY, String(Date.now()));
  } catch {}
};

/** Clears the origin-block flag (called before deliberate user actions). */
export const clearGsiOriginBlockFlag = () => {
  try {
    localStorage.removeItem(GSI_BLOCK_KEY);
  } catch {}
};

/** Loads the Google Identity Services script once (for silent token renewal). */
export const ensureGoogleGsiLoaded = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if ((window as any).google?.accounts?.oauth2) return true;
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_URL}"]`);
    const script = existing || document.createElement('script');
    const finish = (ok: boolean) => resolve(ok && Boolean((window as any).google?.accounts?.oauth2));
    script.addEventListener('load', () => finish(true));
    script.addEventListener('error', () => finish(false));
    if (!existing) {
      script.src = GSI_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).then((ok) => {
    // Allow a retry later if the CDN load failed.
    if (!ok) gsiLoadPromise = null;
    return ok;
  });

  return gsiLoadPromise;
};

/**
 * Requests a fresh Google access token WITHOUT any visible sign-in flow.
 * Uses `prompt: 'none'`, which GUARANTEES zero UI: Google must answer the
 * token request silently from the browser's existing session + the consent
 * granted at sign-in, and returns an error (login_required / access_denied /
 * interaction_required) instead of ever opening an account-chooser popup or
 * consent screen. (`prompt: ''` is NOT a silence guarantee - with several
 * Google accounts signed into the browser it pops the account chooser on
 * renewal, which is exactly what used to happen on page refresh.)
 */
const requestGsiTokenSilently = async (userEmail?: string): Promise<{ token: string; expiresInSeconds: number } | null> => {
  const loaded = await ensureGoogleGsiLoaded();
  const oauth2 = (window as any).google?.accounts?.oauth2;
  if (!loaded || !oauth2) return null;

  return new Promise<{ token: string; expiresInSeconds: number } | null>((resolve) => {
    try {
      gsiLastErrorType = null;
      if (!gsiTokenClient) {
        gsiTokenClient = oauth2.initTokenClient({
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          scope: GOOGLE_SCOPES,
          callback: () => {},
          error_callback: (err: any) => {
            gsiLastErrorType = err?.type || 'unknown';
          },
        });
      }
      const timer = window.setTimeout(() => resolve(null), 10000);
      gsiTokenClient.callback = (resp: any) => {
        window.clearTimeout(timer);
        if (resp?.access_token && !resp.error) {
          resolve({ token: resp.access_token, expiresInSeconds: Number(resp.expires_in) || 3599 });
        } else {
          if (resp?.error === 'origin_mismatch' || resp?.error === 'invalid_client') markGsiOriginBlocked();
          resolve(null);
        }
      };
      // prompt:'none' = hard zero-UI guarantee; errors resolve to null here
      // instead of ever flashing Google sign-in screens during background renewal.
      // login_hint tells Google WHICH account owns the grant, so even with
      // several Google accounts signed into the browser it can complete the
      // silent renewal without asking the user to pick one.
      gsiTokenClient.requestAccessToken({
        prompt: 'none',
        ...(userEmail ? { login_hint: userEmail } : {}),
      });
    } catch {
      resolve(null);
    }
  }).then((result) => {
    // GIS reports origin problems through error_callback rather than the token callback.
    if (!result && (gsiLastErrorType === 'origin_mismatch' || gsiLastErrorType === 'invalid_client')) {
      markGsiOriginBlocked();
    }
    return result;
  });
};

export interface WorkspaceUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export const isGoogleTokenExpired = (): boolean => {
  try {
    const expiresAtStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiresAtStr) return false;
    const expiresAt = parseInt(expiresAtStr, 10);
    // Buffer of 60 seconds before actual expiry
    return Date.now() >= expiresAt - 60000;
  } catch {
    return false;
  }
};

export const getCachedWorkspaceToken = (): string | null => {
  if (cachedAccessToken && !cachedAccessToken.startsWith('eyJ') && cachedAccessToken !== 'local_token' && cachedAccessToken.length > 20) {
    return cachedAccessToken;
  }
  try {
    const googleToken = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (googleToken && !googleToken.startsWith('eyJ') && googleToken !== 'local_token' && googleToken.length > 20) {
      cachedAccessToken = googleToken;
      return googleToken;
    }
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && stored !== 'local_token' && !stored.startsWith('eyJ') && stored.length > 20) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
};

export const setCachedWorkspaceToken = (token: string | null, expiresInSeconds?: number) => {
  if (token && !token.startsWith('eyJ') && token !== 'local_token' && token.length > 20) {
    cachedAccessToken = token;
    const duration = expiresInSeconds && expiresInSeconds > 60 ? expiresInSeconds : 3540;
    const expiresAt = Date.now() + duration * 1000;
    try {
      localStorage.setItem(GOOGLE_TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
    } catch {}
  } else if (!token) {
    cachedAccessToken = null;
    try {
      localStorage.removeItem(GOOGLE_TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch {}
  }
};

/** Remembers which Google account owns this workspace's grant. */
export const setGoogleLoginHint = (email?: string | null) => {
  const value = (email || '').trim();
  try {
    if (value.includes('@')) localStorage.setItem(LOGIN_HINT_KEY, value);
  } catch {}
};

/**
 * Resolves the account that silent renewal must be pinned to.
 *
 * This is the single most important input for a zero-popup refresh: with four
 * Google accounts signed into one browser, a `prompt:'none'` request sent with
 * no `login_hint` gives Google nothing to disambiguate, and it answers with the
 * "Choose an account" screen instead of a silent token. Every background
 * renewal therefore always carries the signed-in user's email - whether the
 * caller passed one or not.
 */
const resolveLoginHint = (explicit?: string): string | undefined => {
  const clean = (v?: string | null): string | undefined => {
    const s = (v || '').trim();
    return s.includes('@') ? s : undefined;
  };
  const direct = clean(explicit);
  if (direct) return direct;
  try {
    const saved = clean(localStorage.getItem(LOGIN_HINT_KEY));
    if (saved) return saved;
    const raw = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');
    if (raw) return clean(JSON.parse(raw)?.email);
  } catch {}
  return undefined;
};

/**
 * Silent Google Identity Services token refresh (no user popup).
 * Keeps session, Sheets & Drive access alive indefinitely.
 */
export const refreshGoogleTokenSilently = async (_userEmail?: string): Promise<string | null> => {
  if (silentRefreshPromise) return silentRefreshPromise;

  silentRefreshPromise = (async () => {
    // 1. A still-valid cached token is the best refresh - reuse it.
    const cached = getCachedWorkspaceToken();
    if (cached && !isGoogleTokenExpired()) return cached;

    // 2. Supabase keeps the Google provider token from the sign-in exchange
    //    (valid for roughly one hour).
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      const providerToken = session?.provider_token;
      if (
        providerToken &&
        !providerToken.startsWith('eyJ') &&
        providerToken !== 'local_token' &&
        providerToken.length > 20
      ) {
        setCachedWorkspaceToken(providerToken);
        return providerToken;
      }
    } catch {}

    // 3. The provider token expires after ~1h and Supabase does not rotate it
    //    (Supabase never stores Google's refresh token). The only client-side
    //    renewal is Google Identity Services - but measured against the live
    //    site, GIS calls window.open() on the OAuth endpoint EVERY time, even
    //    with prompt:'none', so it always creates a Google window. A window is
    //    still a popup, so this step is fenced behind a recorded user tap:
    //    opening the app, the renewal watchdog and 401 retries can never put a
    //    Google window on screen, while a tap-initiated sync renews silently
    //    with prompt:'none' + login_hint (no chooser, no consent screen).
    //    Requires this origin to be in the OAuth client's "Authorized
    //    JavaScript origins"; if it is not, Google answers origin_mismatch -
    //    we remember that and stop retrying instead of flashing the blocked
    //    screen, and callers fall back to the Supabase OAuth redirect.
    if (!isGsiOriginBlocked() && hasFreshUserGesture()) {
      try {
        const fresh = await requestGsiTokenSilently(resolveLoginHint(_userEmail));
        if (fresh) {
          clearGsiOriginBlockFlag();
          setCachedWorkspaceToken(fresh.token, fresh.expiresInSeconds);
          return fresh.token;
        }
      } catch {}
    }

    // 4. Nothing better available - hand back whatever is cached so callers can
    //    still decide between an interactive Connect Google redirect and a clean
    //    error.
    return getCachedWorkspaceToken();
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
export const signInWithGoogleWorkspace = async (): Promise<{ user: WorkspaceUser; accessToken: string }> => {
  if (interactiveAuthPromise) {
    return interactiveAuthPromise;
  }

  interactiveAuthPromise = (async () => {
    const res = await signInWithGoogleSupabase();
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
 * Initialize workspace auth state listener.
 * Restores session from localStorage instantly on browser reopen, and automatically
 * refreshes expired Google OAuth tokens silently in the background.
 */
export const initWorkspaceAuth = (
  onAuthSuccess?: (user: WorkspaceUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const checkCurrentAuth = async () => {
    let token = getCachedWorkspaceToken();
    const savedUserStr = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');

    if (savedUserStr) {
      try {
        const parsed = JSON.parse(savedUserStr);
        const user: WorkspaceUser = {
          id: parsed.id || parsed.sub || 'google_user',
          email: parsed.email || '',
          name: parsed.name || parsed.displayName || 'Google User',
          picture: parsed.picture || parsed.photoURL || undefined,
        };
        // Keep silent renewal pinned to this account so Google never has to ask.
        setGoogleLoginHint(user.email);

        // If we have an existing token, dispatch success immediately so the app renders seamlessly
        if (token && token !== 'local_token' && !token.startsWith('eyJ')) {
          if (onAuthSuccess) onAuthSuccess(user, token);
        }

        // If token is missing, expired, or near expiry, silently renew it using Google Identity Services
        if (!token || isGoogleTokenExpired()) {
          try {
            const freshToken = await refreshGoogleTokenSilently(user.email);
            if (freshToken) {
              token = freshToken;
              if (onAuthSuccess) onAuthSuccess(user, freshToken);
              return;
            }
          } catch (e) {
            console.warn('Silent Google token refresh background attempt:', e);
          }
        }

        if (token && onAuthSuccess) {
          onAuthSuccess(user, token);
          return;
        }
      } catch (err) {
        console.warn('Failed parsing stored user info:', err);
      }
    }

    if (!token && onAuthFailure) {
      onAuthFailure();
    }
  };

  // Immediate check on mount/app boot
  void checkCurrentAuth();

  // Listen to custom auth events triggered by signInWithGoogleWorkspace
  const handleAuthEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.user && detail?.token && onAuthSuccess) {
      setGoogleLoginHint(detail.user?.email);
      onAuthSuccess(detail.user, detail.token);
    }
  };

  window.addEventListener('spenddesk_google_auth', handleAuthEvent);

  return () => {
    window.removeEventListener('spenddesk_google_auth', handleAuthEvent);
  };
};

/**
 * Sign out from Google Workspace
 */
export const signOutGoogleWorkspace = async () => {
  const token = getCachedWorkspaceToken();
  if (token && typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2?.revoke) {
    try {
      (window as any).google.accounts.oauth2.revoke(token, () => {});
    } catch (e) {
      console.warn('Revoke token error:', e);
    }
  }
  setCachedWorkspaceToken(null);
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {}
};


