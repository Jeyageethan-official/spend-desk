import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

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
          prompt: 'select_account consent',
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
        } catch {}
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
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const tokenToUse = session.provider_token || (storedToken && !storedToken.startsWith('eyJ') ? storedToken : session.access_token);
      if (onAuthSuccess) onAuthSuccess(userInfo, tokenToUse);
    } else {
      // Check stored user
      const rawUser = localStorage.getItem(USER_STORAGE_KEY) || localStorage.getItem('money_tracker_user');
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (rawUser) {
        try {
          const parsed = JSON.parse(rawUser);
          if (parsed?.email) {
            if (onAuthSuccess) onAuthSuccess({ displayName: parsed.name || parsed.displayName, email: parsed.email, photoURL: parsed.picture || parsed.photoURL }, storedToken || 'local_token');
            return;
          }
        } catch {}
      }
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
        } catch {}
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
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
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

