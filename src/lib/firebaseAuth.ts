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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export interface AppUser {
  displayName: string;
  email: string;
  photoURL?: string;
}

/**
 * Initialize auth state listener. Call this on app load.
 */
export const initAuth = (
  onAuthSuccess?: (user: AppUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && user.email) {
      const userInfo: AppUser = {
        displayName: user.displayName || user.email.split('@')[0] || 'User',
        email: user.email,
        photoURL: user.photoURL || undefined,
      };
      const token = cachedAccessToken || localStorage.getItem('money_tracker_access_token') || '';
      if (onAuthSuccess) onAuthSuccess(userInfo, token);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Single Sign-In with Google:
 * Logs the user into the app AND obtains Google Sheets & Drive access token
 * with the exact same Gmail account in one single step.
 */
export const googleSignIn = async (): Promise<{ user: AppUser; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || '';

    if (token) {
      cachedAccessToken = token;
      try {
        localStorage.setItem('money_tracker_access_token', token);
      } catch {}
    }

    const userInfo: AppUser = {
      displayName: result.user.displayName || result.user.email?.split('@')[0] || 'User',
      email: result.user.email || '',
      photoURL: result.user.photoURL || undefined,
    };

    try {
      localStorage.setItem('money_tracker_user_info', JSON.stringify({
        id: result.user.uid,
        email: userInfo.email,
        name: userInfo.displayName,
        picture: userInfo.photoURL,
      }));
      localStorage.setItem('money_tracker_user', JSON.stringify(userInfo));
    } catch {}

    return { user: userInfo, accessToken: token };
  } catch (error: any) {
    console.error('Firebase Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || localStorage.getItem('money_tracker_access_token');
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Firebase signout warning:', e);
  }
  cachedAccessToken = null;
  localStorage.removeItem('money_tracker_access_token');
  localStorage.removeItem('money_tracker_user_info');
  localStorage.removeItem('money_tracker_user');
};
