export const GOOGLE_OAUTH_CLIENT_ID = '509348493041-ih637992a2lrmh6qdlvch1pkatpn70k0.apps.googleusercontent.com';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const TOKEN_KEY = 'money_tracker_access_token';
const USER_STORAGE_KEY = 'money_tracker_user_info';

let cachedAccessToken: string | null = null;

export interface WorkspaceUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export const getCachedWorkspaceToken = (): string | null => {
  if (cachedAccessToken && !cachedAccessToken.startsWith('eyJ') && cachedAccessToken !== 'local_token') {
    return cachedAccessToken;
  }
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && stored !== 'local_token' && !stored.startsWith('eyJ') && stored.length > 20) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
};

export const setCachedWorkspaceToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
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
 * Dynamically ensure Google Identity Services client script is loaded
 */
export const ensureGsiLoaded = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      setTimeout(resolve, 1500);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
    setTimeout(resolve, 2000);
  });
};

/**
 * Sign in directly with Google Identity Services (GIS).
 * Obtains Google OAuth token for Google Sheets & Drive.
 * Completely eliminates Firebase domain restrictions.
 */
export const signInWithGoogleWorkspace = async (): Promise<{ user: WorkspaceUser; accessToken: string }> => {
  await ensureGsiLoaded();

  if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
    throw new Error('Google Identity Services client is not available. Please verify your internet connection.');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) {
            console.error('Google OAuth token error:', resp);
            reject(new Error(resp.error_description || resp.error || 'Google Sign-In failed'));
            return;
          }

          const token = resp.access_token;
          if (!token) {
            reject(new Error('No access token returned from Google.'));
            return;
          }

          setCachedWorkspaceToken(token);

          try {
            const profile = await fetchGoogleUserInfo(token);
            const user: WorkspaceUser = {
              id: profile.sub,
              email: profile.email || '',
              name: profile.name || profile.email?.split('@')[0] || 'User',
              picture: profile.picture,
            };

            try {
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
              localStorage.setItem('money_tracker_user', JSON.stringify({
                displayName: user.name,
                email: user.email,
                photoURL: user.picture,
              }));
            } catch {}

            window.dispatchEvent(new CustomEvent('spenddesk_google_auth', { detail: { user, token } }));
            resolve({ user, accessToken: token });
          } catch (profileErr) {
            console.warn('Could not fetch user profile from token:', profileErr);
            const fallbackUser: WorkspaceUser = {
              id: 'google_user_' + Date.now(),
              email: '',
              name: 'Google User',
            };
            resolve({ user: fallbackUser, accessToken: token });
          }
        },
        error_callback: (err: any) => {
          console.warn('GIS Error callback:', err);
          reject(new Error(err?.message || 'Google Sign-In was closed.'));
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      reject(err);
    }
  });
};

/**
 * Initialize workspace auth state listener
 */
export const initWorkspaceAuth = (
  onAuthSuccess?: (user: WorkspaceUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const checkCurrentAuth = () => {
    const token = getCachedWorkspaceToken();
    const savedUser = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');

    if (savedUser && token && token !== 'local_token' && !token.startsWith('eyJ')) {
      try {
        const parsed = JSON.parse(savedUser);
        const user: WorkspaceUser = {
          id: parsed.id || parsed.sub || 'google_user',
          email: parsed.email || '',
          name: parsed.name || parsed.displayName || 'Google User',
          picture: parsed.picture || parsed.photoURL || undefined,
        };
        if (onAuthSuccess) onAuthSuccess(user, token);
        return;
      } catch {}
    }

    if (onAuthFailure) onAuthFailure();
  };

  // Immediate check
  checkCurrentAuth();

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
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {}
};
