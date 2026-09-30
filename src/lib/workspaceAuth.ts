import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
const TOKEN_KEY = 'money_tracker_access_token';

export const getCachedWorkspaceToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && stored !== 'local_token' && !stored.startsWith('eyJ')) {
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

export interface WorkspaceUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export const signInWithGoogleWorkspace = async (): Promise<{ user: WorkspaceUser; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google OAuth token could not be obtained.');
    }

    const token = credential.accessToken;
    setCachedWorkspaceToken(token);

    const user: WorkspaceUser = {
      id: result.user.uid,
      email: result.user.email || '',
      name: result.user.displayName || result.user.email?.split('@')[0] || 'User',
      picture: result.user.photoURL || undefined,
    };

    return { user, accessToken: token };
  } catch (error: any) {
    console.error('Google Workspace sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const initWorkspaceAuth = (
  onAuthSuccess?: (user: WorkspaceUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    if (firebaseUser) {
      const token = getCachedWorkspaceToken() || '';
      const user: WorkspaceUser = {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        picture: firebaseUser.photoURL || undefined,
      };
      if (token && onAuthSuccess) {
        onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthSuccess) {
          onAuthSuccess(user, '');
        }
      }
    } else {
      setCachedWorkspaceToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signOutGoogleWorkspace = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('Firebase signout warning:', e);
  }
  setCachedWorkspaceToken(null);
};
