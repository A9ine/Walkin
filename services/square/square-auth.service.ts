import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

WebBrowser.maybeCompleteAuthSession();

// Square OAuth Configuration
const SQUARE_APP_ID = process.env.EXPO_PUBLIC_SQUARE_APP_ID || '';
const SQUARE_OAUTH_BASE = 'https://connect.squareup.com/oauth2';

// Storage keys
const SQUARE_ACCESS_TOKEN_KEY = 'square_access_token';
const SQUARE_REFRESH_TOKEN_KEY = 'square_refresh_token';
const SQUARE_MERCHANT_ID_KEY = 'square_merchant_id';
const SQUARE_TOKEN_EXPIRES_KEY = 'square_token_expires';

// OAuth scopes needed for catalog access
const SQUARE_SCOPES = [
  'ITEMS_READ',
  'ITEMS_WRITE',
  'INVENTORY_READ',
  'MERCHANT_PROFILE_READ',
].join(' ');

export interface SquareAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  merchantId?: string;
  expiresAt?: Date;
  error?: string;
}

export interface SquareTokens {
  accessToken: string;
  refreshToken: string;
  merchantId: string;
  expiresAt: Date;
}

/**
 * Square OAuth Authentication Service
 */
class SquareAuthService {
  private redirectUri: string;

  constructor() {
    this.redirectUri = AuthSession.makeRedirectUri({
      scheme: 'bubbletea',
      path: 'square-callback',
    });
  }

  /**
   * Get the authorization URL for Square OAuth
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: SQUARE_APP_ID,
      response_type: 'code',
      scope: SQUARE_SCOPES,
      redirect_uri: this.redirectUri,
      state,
      session: 'false',
    });

    return `${SQUARE_OAUTH_BASE}/authorize?${params.toString()}`;
  }

  /**
   * Start the OAuth flow
   */
  async authorize(): Promise<SquareAuthResult> {
    if (!SQUARE_APP_ID) {
      return {
        success: false,
        error: 'Square App ID not configured. Please add EXPO_PUBLIC_SQUARE_APP_ID to your environment.',
      };
    }

    try {
      // Generate a random state for CSRF protection
      const state = Math.random().toString(36).substring(7);
      const authUrl = this.getAuthorizationUrl(state);

      // Open the authorization URL in the browser
      const result = await WebBrowser.openAuthSessionAsync(authUrl, this.redirectUri);

      if (result.type !== 'success') {
        return {
          success: false,
          error: result.type === 'cancel' ? 'Authorization cancelled' : 'Authorization failed',
        };
      }

      // Parse the authorization code from the redirect URL
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        return {
          success: false,
          error: url.searchParams.get('error_description') || error,
        };
      }

      if (!code) {
        return {
          success: false,
          error: 'No authorization code received',
        };
      }

      if (returnedState !== state) {
        return {
          success: false,
          error: 'State mismatch - possible CSRF attack',
        };
      }

      // Exchange the code for tokens
      return await this.exchangeCodeForTokens(code);
    } catch (error) {
      console.error('Square OAuth error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authorization failed',
      };
    }
  }

  /**
   * Exchange authorization code for access tokens
   * Note: In production, this should be done on your backend server
   * to keep your client secret secure
   */
  private async exchangeCodeForTokens(code: string): Promise<SquareAuthResult> {
    try {
      // For demo purposes, we'll simulate a successful token exchange
      // In production, you would:
      // 1. Send the code to your backend server
      // 2. Your server exchanges the code using the client secret
      // 3. Your server returns the tokens to the app

      // Simulated successful response
      const mockAccessToken = `sandbox-sq0${code.substring(0, 20)}`;
      const mockRefreshToken = `refresh-sq0${code.substring(0, 20)}`;
      const mockMerchantId = 'MERCHANT_' + Math.random().toString(36).substring(7).toUpperCase();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Store tokens securely
      await this.storeTokens({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        merchantId: mockMerchantId,
        expiresAt,
      });

      return {
        success: true,
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        merchantId: mockMerchantId,
        expiresAt,
      };
    } catch (error) {
      console.error('Token exchange error:', error);
      return {
        success: false,
        error: 'Failed to exchange authorization code for tokens',
      };
    }
  }

  /**
   * Store tokens securely
   */
  async storeTokens(tokens: SquareTokens): Promise<void> {
    await SecureStore.setItemAsync(SQUARE_ACCESS_TOKEN_KEY, tokens.accessToken);
    await SecureStore.setItemAsync(SQUARE_REFRESH_TOKEN_KEY, tokens.refreshToken);
    await SecureStore.setItemAsync(SQUARE_MERCHANT_ID_KEY, tokens.merchantId);
    await SecureStore.setItemAsync(SQUARE_TOKEN_EXPIRES_KEY, tokens.expiresAt.toISOString());
  }

  /**
   * Get stored tokens
   */
  async getStoredTokens(): Promise<SquareTokens | null> {
    try {
      const accessToken = await SecureStore.getItemAsync(SQUARE_ACCESS_TOKEN_KEY);
      const refreshToken = await SecureStore.getItemAsync(SQUARE_REFRESH_TOKEN_KEY);
      const merchantId = await SecureStore.getItemAsync(SQUARE_MERCHANT_ID_KEY);
      const expiresAtStr = await SecureStore.getItemAsync(SQUARE_TOKEN_EXPIRES_KEY);

      if (!accessToken || !refreshToken || !merchantId || !expiresAtStr) {
        return null;
      }

      return {
        accessToken,
        refreshToken,
        merchantId,
        expiresAt: new Date(expiresAtStr),
      };
    } catch (error) {
      console.error('Error getting stored tokens:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated with Square
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    if (!tokens) return false;

    // Check if token is expired
    if (new Date() > tokens.expiresAt) {
      // Token expired - would need to refresh
      return false;
    }

    return true;
  }

  /**
   * Get the current access token
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    if (!tokens) return null;

    // Check if token is expired
    if (new Date() > tokens.expiresAt) {
      // In production, refresh the token here
      return null;
    }

    return tokens.accessToken;
  }

  /**
   * Disconnect from Square (clear tokens)
   */
  async disconnect(): Promise<void> {
    await SecureStore.deleteItemAsync(SQUARE_ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(SQUARE_REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(SQUARE_MERCHANT_ID_KEY);
    await SecureStore.deleteItemAsync(SQUARE_TOKEN_EXPIRES_KEY);
  }
}

export const squareAuthService = new SquareAuthService();
