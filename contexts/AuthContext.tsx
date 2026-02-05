import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from '@/config/firebase';

// Guest user object for development/testing
const GUEST_USER = {
  uid: 'guest-user-dev',
  email: 'guest@example.com',
  displayName: 'Guest User',
  emailVerified: false,
  isAnonymous: true,
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => '',
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
  phoneNumber: null,
  photoURL: null,
  providerId: 'guest',
} as unknown as User;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: (idToken: string, accessToken?: string) => Promise<void>;
  signInWithApple: (identityToken: string, nonce: string) => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!isGuest) {
        setUser(currentUser);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [isGuest]);

  const signIn = async (email: string, password: string): Promise<void> => {
    setIsGuest(false);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string): Promise<void> => {
    setIsGuest(false);
    await createUserWithEmailAndPassword(auth, email, password);
    // Sign out after registration so user can manually log in
    await firebaseSignOut(auth);
    setUser(null);
  };

  const signOut = async (): Promise<void> => {
    if (isGuest) {
      setIsGuest(false);
      setUser(null);
      return;
    }
    try {
      await firebaseSignOut(auth);
      // Ensure user state is cleared even if onAuthStateChanged is slow
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email);
  };

  const signInWithGoogle = async (idToken: string, accessToken?: string): Promise<void> => {
    setIsGuest(false);
    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    await signInWithCredential(auth, credential);
  };

  const signInWithApple = async (identityToken: string, nonce: string): Promise<void> => {
    setIsGuest(false);
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: identityToken,
      rawNonce: nonce,
    });
    await signInWithCredential(auth, credential);
  };

  const continueAsGuest = (): void => {
    setIsGuest(true);
    setUser(GUEST_USER);
    setLoading(false);
  };

  const value: AuthContextType = {
    user,
    loading,
    isGuest,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithGoogle,
    signInWithApple,
    continueAsGuest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { AuthContext };
