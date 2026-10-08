import { signInWithGoogleSupabase } from './supabase';

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
export const refreshGoogleTokenSilently = async (userEmail?: string): Promise<string | null> => {
  if (silentRefreshPromise) return silentRefreshPromise;

  silentRefreshPromise = new Promise<string | null>((resolve) => {
    if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2?.initTokenClient) {
      resolve(null);
      return;
    }

    const email = userEmail || (() => {
      try {
        const saved = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');
        return saved ? JSON.parse(saved).email : undefined;
      } catch {
        return undefined;
      }
    })();

    const timeout = setTimeout(() => {
      resolve(null);
    }, 6000);

    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        hint: email || undefined,
        prompt: '',
        callback: (res: any) => {
          clearTimeout(timeout);
          if (res?.access_token && !res.access_token.startsWith('eyJ')) {
            const expiresIn = parseInt(res.expires_in, 10) || 3540;
            setCachedWorkspaceToken(res.access_token, expiresIn);
            resolve(res.access_token);
          } else {
            resolve(null);
          }
        },
        error_callback: () => {
          clearTimeout(timeout);
          resolve(null);
        },
      });

      client.requestAccessToken({ prompt: '', hint: email || undefined });
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  }).finally(() => {
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
 * Single Sign-In with Google Workspace (Google Identity Services + Supabase fallback).
 * In a single sign-in flow, user grants Drive and Sheets permissions directly.
 * The session, user info, Drive and Sheets access are immediately ready.
 */
export const signInWithGoogleWorkspace = async (): Promise<{ user: WorkspaceUser; accessToken: string }> => {
  // 1. Try Google Identity Services (GIS) token client popup directly
  if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2?.initTokenClient) {
    try {
      const authResult = await new Promise<{ user: WorkspaceUser; accessToken: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Sign-In timed out')), 60000);

        try {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_OAUTH_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            prompt: 'select_account',
            callback: async (res: any) => {
              clearTimeout(timeout);
              if (res?.access_token && !res.access_token.startsWith('eyJ')) {
                const token = res.access_token;
                const expiresIn = parseInt(res.expires_in, 10) || 3540;
                setCachedWorkspaceToken(token, expiresIn);

                try {
                  const info = await fetchGoogleUserInfo(token);
                  const user: WorkspaceUser = {
                    id: info.sub,
                    email: info.email || '',
                    name: info.name || info.email?.split('@')[0] || 'Google User',
                    picture: info.picture,
                  };
                  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
                  localStorage.setItem('money_tracker_user', JSON.stringify({
                    displayName: user.name,
                    email: user.email,
                    photoURL: user.picture,
                  }));
                  window.dispatchEvent(new CustomEvent('spenddesk_google_auth', { detail: { user, token } }));
                  resolve({ user, accessToken: token });
                } catch {
                  // Fallback user if userinfo failed
                  const fallbackUser: WorkspaceUser = {
                    id: 'google_user',
                    email: '',
                    name: 'Google User',
                  };
                  resolve({ user: fallbackUser, accessToken: token });
                }
              } else if (res?.error) {
                reject(new Error(res.error_description || res.error));
              } else {
                reject(new Error('Sign in was cancelled or no token returned.'));
              }
            },
            error_callback: (err: any) => {
              clearTimeout(timeout);
              reject(err);
            },
          });

          client.requestAccessToken({ prompt: 'select_account' });
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      return authResult;
    } catch (gisError: any) {
      console.warn('GIS interactive token client attempt failed, falling back to Supabase OAuth redirect:', gisError);
    }
  }

  // 2. Fallback: Supabase OAuth redirect with full Google scopes
  await signInWithGoogleSupabase();
  return {
    user: { id: 'pending', email: '', name: 'Google User' },
    accessToken: '',
  };
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


