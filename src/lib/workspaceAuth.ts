import { getSupabase, signInWithGoogleSupabase } from './supabase';

// OAuth web client that Supabase uses for Google sign-in (project 377806164433).
// It already holds the user's grant for the Sheets/Drive scopes from the login
// consent, so a token request with prompt:'' is fully silent - no popup and no
// consent screen. (The old5093... client had no grant and no authorized
// JavaScript origins, which caused Google's "Error 400: origin_mismatch".)
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
 * With `prompt: ''` Google reuses the browser's existing Google session and
 * the consent granted at sign-in, so neither a popup nor a consent screen
 * appears in the normal case.
 */
const requestGsiTokenSilently = async (): Promise<{ token: string; expiresInSeconds: number } | null> => {
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
      gsiTokenClient.requestAccessToken({ prompt: '' });
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
    //    (Supabase never stores Google's refresh token). Renew it silently via
    //    Google Identity Services: with prompt:'' Google reuses the browser's
    //    Google session AND the grant made at sign-in, so nothing visible
    //    happens - completely silent renewal until the user signs out.
    //    Requires this origin to be in the OAuth client's "Authorized
    //    JavaScript origins"; if it is not, Google answers origin_mismatch -
    //    we remember that and stop retrying instead of flashing the blocked
    //    screen, and callers fall back to the Supabase OAuth redirect.
    if (!isGsiOriginBlocked()) {
      try {
        const fresh = await requestGsiTokenSilently();
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


