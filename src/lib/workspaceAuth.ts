import { signInWithGoogleSupabase } from './supabase';

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
 * Sign in with Google using Supabase OAuth.
 * Shows all Gmail accounts (select_account prompt) and avoids origin_mismatch errors.
 */
export const signInWithGoogleWorkspace = async (): Promise<{ user: WorkspaceUser; accessToken: string }> => {
  const token = getCachedWorkspaceToken();
  const savedUser = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');
  if (token && savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      return {
        user: {
          id: parsed.id || 'user',
          email: parsed.email || '',
          name: parsed.name || parsed.displayName || 'User',
          picture: parsed.picture || parsed.photoURL,
        },
        accessToken: token,
      };
    } catch {}
  }

  // Redirect through Supabase OAuth with prompt: 'select_account consent'
  // to list all Gmail accounts and completely bypass origin_mismatch restrictions.
  await signInWithGoogleSupabase();
  return {
    user: { id: 'pending', email: '', name: 'Google User' },
    accessToken: '',
  };
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
