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

const GOOGLE_TOKEN_KEY = 'spenddesk_google_token';
const GOOGLE_REFRESH_TOKEN_KEY = 'spenddesk_google_refresh_token';
const GOOGLE_TOKEN_EXPIRES_AT_KEY = 'spenddesk_google_token_expires_at';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export const REQUIRED_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

export const isUsableGoogleSheetsToken = (token: string | null | undefined): token is string =>
  Boolean(token && token !== 'local_token' && !token.startsWith('eyJ') && token.length > 20);

export const hasStoredGoogleRefreshToken = (): boolean => {
  try {
    return Boolean(localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY)?.trim());
  } catch {
    return false;
  }
};

const readTokenExpiryMs = (): number | null => {
  try {
    const raw = localStorage.getItem(GOOGLE_TOKEN_EXPIRES_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

export const isCachedGoogleTokenExpired = (): boolean => {
  const expiresAt = readTokenExpiryMs();
  if (!expiresAt) return false;
  return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;
};

export const clearGoogleOAuthCredentials = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GOOGLE_REFRESH_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_EXPIRES_AT_KEY);
  } catch {}
};

export const persistGoogleOAuthBundle = (opts: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresInSeconds?: number | null;
}) => {
  if (opts.refreshToken?.trim()) {
    try {
      localStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, opts.refreshToken.trim());
    } catch {}
  }
  if (opts.accessToken && isUsableGoogleSheetsToken(opts.accessToken)) {
    setCachedWorkspaceToken(opts.accessToken, opts.expiresInSeconds ?? undefined);
  } else if (opts.expiresInSeconds && opts.expiresInSeconds > 0) {
    try {
      localStorage.setItem(
        GOOGLE_TOKEN_EXPIRES_AT_KEY,
        String(Date.now() + opts.expiresInSeconds * 1000)
      );
    } catch {}
  }
};

export const parseGoogleOAuthHash = (hash: string): {
  providerToken?: string;
  providerRefreshToken?: string;
  expiresIn?: number;
} => {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const providerToken = params.get('provider_token') || undefined;
    const providerRefreshToken = params.get('provider_refresh_token') || undefined;
    const expiresInRaw = params.get('expires_in');
    const expiresIn = expiresInRaw ? Number(expiresInRaw) : undefined;
    return {
      providerToken,
      providerRefreshToken,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    };
  } catch {
    return {};
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
  if (token && isUsableGoogleSheetsToken(token)) {
    cachedAccessToken = token;
    try {
      localStorage.setItem(GOOGLE_TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
      if (expiresInSeconds && expiresInSeconds > 0) {
        localStorage.setItem(
          GOOGLE_TOKEN_EXPIRES_AT_KEY,
          String(Date.now() + expiresInSeconds * 1000)
        );
      }
    } catch {}
  } else if (!token) {
    clearGoogleOAuthCredentials();
  }
};

/** Refresh Google access token using stored offline refresh token (survives browser restarts). */
export const refreshGoogleAccessTokenFromRefreshToken = async (): Promise<string | null> => {
  let refreshToken: string | null = null;
  try {
    refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  } catch {}
  if (!refreshToken?.trim()) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken.trim(),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const accessToken = data.access_token as string | undefined;
    if (!accessToken || !isUsableGoogleSheetsToken(accessToken)) return null;
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    setCachedWorkspaceToken(accessToken, expiresIn);
    if (typeof data.refresh_token === 'string' && data.refresh_token.trim()) {
      persistGoogleOAuthBundle({ refreshToken: data.refresh_token });
    }
    return accessToken;
  } catch {
    return null;
  }
};

export const inspectGoogleWorkspaceAccess = async (
  accessToken: string
): Promise<{ ok: boolean; missingScopes: string[] }> => {
  if (!isUsableGoogleSheetsToken(accessToken)) {
    return { ok: false, missingScopes: [...REQUIRED_GOOGLE_SCOPES] };
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return { ok: false, missingScopes: [...REQUIRED_GOOGLE_SCOPES] };
    const info = await res.json();
    if (info.error) return { ok: false, missingScopes: [...REQUIRED_GOOGLE_SCOPES] };
    const scope = String(info.scope || info.scope_string || '');
    const hasSheets =
      scope.includes('spreadsheets') || scope.includes('www.googleapis.com/auth/spreadsheets');
    const hasDrive = scope.includes('drive.file') || scope.includes('drive');
    if (!hasSheets || !hasDrive) {
      return {
        ok: false,
        missingScopes: [
          ...(!hasSheets ? ['https://www.googleapis.com/auth/spreadsheets'] : []),
          ...(!hasDrive ? ['https://www.googleapis.com/auth/drive.file'] : []),
        ],
      };
    }
    return { ok: true, missingScopes: [] };
  } catch {
    return { ok: false, missingScopes: [...REQUIRED_GOOGLE_SCOPES] };
  }
};

/** Validate or silently renew Sheets/Drive access (refresh token → GIS silent). */
export const ensurePersistentGoogleAccess = async (interactive = false): Promise<string> => {
  let token = getCachedWorkspaceToken();
  if (token && !isCachedGoogleTokenExpired()) {
    const check = await inspectGoogleWorkspaceAccess(token);
    if (check.ok) return token;
  }

  if (token && isCachedGoogleTokenExpired()) {
    setCachedWorkspaceToken(null);
    token = null;
  }

  const refreshed = await refreshGoogleAccessTokenFromRefreshToken();
  if (refreshed) {
    const check = await inspectGoogleWorkspaceAccess(refreshed);
    if (check.ok) return refreshed;
  }

  if (!interactive) return token && isUsableGoogleSheetsToken(token) ? token : '';

  return token && isUsableGoogleSheetsToken(token) ? token : '';
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

    if (savedUser && isUsableGoogleSheetsToken(token)) {
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
  clearGoogleOAuthCredentials();
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {}
};
