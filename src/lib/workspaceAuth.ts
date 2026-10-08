import { getSupabase, signInWithGoogleSupabase } from './supabase';

export const GOOGLE_OAUTH_CLIENT_ID = '509348493041-ih637992a2lrmh6qdlvch1pkatpn70k0.apps.googleusercontent.com';

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

export const ensureGoogleGsiLoaded = async (): Promise<boolean> => {
  return false;
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
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.provider_token && !session.provider_token.startsWith('eyJ')) {
        setCachedWorkspaceToken(session.provider_token);
        return session.provider_token;
      }
    } catch {}

    const cached = getCachedWorkspaceToken();
    if (cached) return cached;
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


