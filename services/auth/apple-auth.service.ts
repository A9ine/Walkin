import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Generate a random nonce for Apple Sign-In
 */
export async function generateNonce(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const nonce = Array.from(new Uint8Array(randomBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return nonce;
}

/**
 * Hash the nonce using SHA256
 */
export async function sha256(nonce: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    nonce
  );
  return hash;
}

/**
 * Check if Apple Sign-In is available on this device
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  return await AppleAuthentication.isAvailableAsync();
}

export interface AppleAuthResult {
  identityToken: string;
  nonce: string;
  user?: string;
  email?: string | null;
  fullName?: {
    givenName?: string | null;
    familyName?: string | null;
  } | null;
}

/**
 * Sign in with Apple
 */
export async function signInWithApple(): Promise<AppleAuthResult> {
  // Generate nonce
  const rawNonce = await generateNonce();
  const hashedNonce = await sha256(rawNonce);

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('No identity token received from Apple');
  }

  return {
    identityToken: credential.identityToken,
    nonce: rawNonce,
    user: credential.user,
    email: credential.email,
    fullName: credential.fullName,
  };
}

export { AppleAuthentication };
