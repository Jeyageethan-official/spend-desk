import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import {
  getCachedWorkspaceToken,
  hasStoredGoogleRefreshToken,
  isUsableGoogleSheetsToken,
  parseGoogleOAuthHash,
  persistGoogleOAuthBundle,
  setCachedWorkspaceToken,
} from './workspaceAuth';

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
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'spenddesk-supabase-auth',
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
export const signInWithGoogleSupabase = async (): Promise<AuthResult> => {
  try {
    const supabase = getSupabase();
    // Dynamic redirect URL to ensure user stays on the exact current website domain (Live site vs Localhost)
    const currentOrigin = window.location.origin;
    const currentPath = window.location.pathname;
    const redirectUrl = `${currentOrigin}${currentPath}`.replace(/\/+$/, '') + '/';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: hasStoredGoogleRefreshToken() ? 'select_account' : 'consent select_account',
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
 * Sign out user
 */
export const signOutSupabase = async () => {
  try {
    const supabase = getSupabase();
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

const applySupabaseSession = (
  session: {
    user: User;
    provider_token?: string | null;
    provider_refresh_token?: string | null;
    expires_in?: number;
  },
  onAuthSuccess?: (user: { displayName: string; email: string; photoURL?: string }, token: string) => void
) => {
  const u = session.user;
  const userInfo = {
    displayName: u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
    email: u.email || '',
    photoURL: u.user_metadata?.avatar_url || undefined,
  };
  persistGoogleOAuthBundle({
    accessToken: session.provider_token,
    refreshToken: session.provider_refresh_token,
    expiresInSeconds: session.expires_in ?? 3600,
  });
  try {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        id: u.id,
        name: userInfo.displayName,
        email: userInfo.email,
        picture: userInfo.photoURL,
      })
    );
    localStorage.setItem('money_tracker_user', JSON.stringify(userInfo));
  } catch {}
  const storedToken = getCachedWorkspaceToken();
  const tokenToUse =
    (session.provider_token && isUsableGoogleSheetsToken(session.provider_token) && session.provider_token) ||
    (storedToken && isUsableGoogleSheetsToken(storedToken) ? storedToken : '');
  if (onAuthSuccess) onAuthSuccess(userInfo, tokenToUse);
};

/**
 * Auth state listener
 */
export const initSupabaseAuth = (
  onAuthSuccess?: (user: { displayName: string; email: string; photoURL?: string }, token: string) => void,
  onAuthFailure?: () => void
) => {
  const supabase = getSupabase();

  // Capture Google provider tokens from the OAuth redirect hash (single sign-in bundle).
  if (typeof window !== 'undefined' && window.location.hash) {
    try {
      const parsed = parseGoogleOAuthHash(window.location.hash);
      persistGoogleOAuthBundle({
        accessToken: parsed.providerToken,
        refreshToken: parsed.providerRefreshToken,
        expiresInSeconds: parsed.expiresIn ?? 3600,
      });
    } catch {}
  }

  const hasLocalGoogleSession = (): boolean => {
    const savedUser = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');
    return Boolean(savedUser && getCachedWorkspaceToken());
  };

  // Check current session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      applySupabaseSession(session, onAuthSuccess);
    } else if (!hasLocalGoogleSession() && onAuthFailure) {
      onAuthFailure();
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      applySupabaseSession(session, onAuthSuccess);
    } else if (event === 'SIGNED_OUT') {
      if (onAuthFailure) onAuthFailure();
    }
  });

  return () => {
    subscription.unsubscribe();
  };
};

