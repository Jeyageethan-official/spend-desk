import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const OAUTH_CLIENT_ID = firebaseConfig.oAuthClientId;

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

const TOKEN_STORAGE_KEY = 'money_tracker_access_token';
const USER_STORAGE_KEY = 'money_tracker_user_info';

let cachedAccessToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
})();

let cachedUserInfo: { name: string; email: string; picture?: string } | null = (() => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

// Initialize auth state listener.
export const initAuth = (
  onAuthSuccess?: (user: User | { displayName: string; email: string; photoURL?: string }, token: string) => void,
  onAuthFailure?: () => void
) => {
  // If we already have stored GIS token & user info, trigger success immediately!
  if (cachedUserInfo && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(cachedUserInfo as any, cachedAccessToken);
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (cachedUserInfo && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(cachedUserInfo as any, cachedAccessToken);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export interface SignInResult {
  success: boolean;
  user?: any;
  accessToken?: string;
  errorType?: 'access_denied_test_user' | 'popup_closed' | 'session_storage_blocked' | 'general';
  errorMessage?: string;
}

/**
 * Modern Google Identity Services (GIS) Token Client.
 * This runs directly without Firebase's __/auth/handler iframe,
 * completely avoiding the "sessionStorage is inaccessible" browser error!
 */
export const signInWithGoogleIdentityServices = (): Promise<SignInResult> => {
  return new Promise((resolve) => {
    try {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        console.warn('Google Identity Services script not yet loaded, falling back to Firebase popup');
        fallbackFirebaseSignIn().then(resolve);
        return;
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: OAUTH_CLIENT_ID,
        scope: SCOPES.join(' '),
        callback: async (response: any) => {
          if (response.error) {
            console.error('GIS Error:', response);
            if (response.error === 'access_denied') {
              resolve({
                success: false,
                errorType: 'access_denied_test_user',
                errorMessage: 'Google blocked access: Account needs to be added to Test Users in Google Cloud.'
              });
            } else {
              resolve({
                success: false,
                errorType: 'general',
                errorMessage: response.error_description || response.error
              });
            }
            return;
          }

          if (response.access_token) {
            cachedAccessToken = response.access_token;

            // Fetch user info from Google's userinfo endpoint
            try {
              const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
              });
              if (infoRes.ok) {
                const info = await infoRes.json();
                cachedUserInfo = {
                  name: info.name || info.email,
                  email: info.email,
                  picture: info.picture,
                };
              }
            } catch (e) {
              console.warn('Could not fetch user profile info:', e);
            }

            const activeUser = cachedUserInfo || {
              displayName: 'Google User',
              email: 'connected@google.com',
            };

            try {
              localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
              localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(activeUser));
            } catch (e) {
              console.warn('Could not persist auth to localStorage', e);
            }

            resolve({
              success: true,
              user: activeUser,
              accessToken: response.access_token,
            });
          } else {
            resolve({
              success: false,
              errorType: 'general',
              errorMessage: 'No access token received from Google.',
            });
          }
        },
        error_callback: (nonOAuthError: any) => {
          console.error('GIS Non-OAuth error:', nonOAuthError);
          resolve({
            success: false,
            errorType: 'general',
            errorMessage: nonOAuthError.message || 'OAuth initialization failed',
          });
        }
      });

      // Request token with select_account
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      console.error('GIS Exception:', err);
      fallbackFirebaseSignIn().then(resolve);
    }
  });
};

/**
 * Fallback to Firebase popup if GIS is unavailable
 */
export const fallbackFirebaseSignIn = async (): Promise<SignInResult> => {
  try {
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((s) => provider.addScope(s));
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google');
    }

    cachedAccessToken = credential.accessToken;
    return {
      success: true,
      user: result.user,
      accessToken: cachedAccessToken,
    };
  } catch (error: any) {
    console.error('Firebase Auth Error:', error);
    const msg = error?.message || '';
    if (msg.includes('sessionStorage')) {
      return {
        success: false,
        errorType: 'session_storage_blocked',
        errorMessage: 'Browser blocked sessionStorage in third-party context.',
      };
    }
    if (msg.includes('access_denied') || msg.includes('403')) {
      return {
        success: false,
        errorType: 'access_denied_test_user',
        errorMessage: 'Google blocked access: Test user permissions needed.',
      };
    }
    return {
      success: false,
      errorType: 'general',
      errorMessage: msg,
    };
  }
};

export const googleSignIn = async (): Promise<SignInResult> => {
  return await signInWithGoogleIdentityServices();
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    // Ignore
  }
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (e) {}
  cachedAccessToken = null;
  cachedUserInfo = null;
};
