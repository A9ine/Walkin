import { app } from '@/config/firebase';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { getFunctions, httpsCallable } from 'firebase/functions';

WebBrowser.maybeCompleteAuthSession();

// Initialize Firebase Functions
const functions = getFunctions(app);

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
  // HTTPS URL for Square (they require HTTPS)
  private squareRedirectUri: string = 'https://walkin-ab27f.web.app/square-callback.html';
  // Custom scheme URL that the app listens for
  private appCallbackUri: string = 'bubbletea://square-callback';

  constructor() {
    // redirectUri is what we tell Square (HTTPS required)
    // The HTML page will redirect to the custom scheme
  }

  get redirectUri(): string {
    return this.squareRedirectUri;
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
    console.log(`${SQUARE_OAUTH_BASE}/authorize?${params.toString()}`)
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
      // Listen for the custom scheme redirect (HTML page will redirect from HTTPS to this)
      const result = await WebBrowser.openAuthSessionAsync(authUrl, this.appCallbackUri);

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
   * Uses Firebase Cloud Function to keep client_secret secure
   */
  private async exchangeCodeForTokens(code: string): Promise<SquareAuthResult> {
    try {
      // Call Firebase Cloud Function to exchange the code
      const exchangeToken = httpsCallable<
        { code: string; redirectUri: string },
        { accessToken: string; refreshToken: string; merchantId: string; expiresAt: string }
      >(functions, 'exchangeSquareToken');

      const result = await exchangeToken({
        code,
        redirectUri: this.redirectUri,
      });

      const { accessToken, refreshToken, merchantId, expiresAt } = result.data;
      const expiresAtDate = new Date(expiresAt);

      // Store tokens securely
      await this.storeTokens({
        accessToken,
        refreshToken,
        merchantId,
        expiresAt: expiresAtDate,
      });

      return {
        success: true,
        accessToken,
        refreshToken,
        merchantId,
        expiresAt: expiresAtDate,
      };
    } catch (error: any) {
      console.error('Token exchange error:', error);
      return {
        success: false,
        error: error.message || 'Failed to exchange authorization code for tokens',
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
      // Try to refresh the token
      const refreshResult = await this.refreshTokens(tokens.refreshToken);
      return refreshResult.success;
    }

    return true;
  }

  /**
   * Validate the connection by making a test API call to Square
   * Returns true if the tokens are valid and working
   */
  async validateConnection(): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return false;

      // Make a lightweight API call to verify tokens work
      const response = await fetch('https://connect.squareup.com/v2/merchants/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Square-Version': '2024-01-18',
        },
      });

      if (!response.ok) {
        console.log('Square connection validation failed:', response.status);
        // If unauthorized, clear the invalid tokens
        if (response.status === 401) {
          await this.disconnect();
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating Square connection:', error);
      return false;
    }
  }

  /**
   * Get the current access token, refreshing if expired
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getStoredTokens();
    if (!tokens) return null;

    // Check if token is expired (with 5 minute buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    if (new Date().getTime() > tokens.expiresAt.getTime() - bufferTime) {
      // Token expired or expiring soon, try to refresh
      const refreshResult = await this.refreshTokens(tokens.refreshToken);
      if (refreshResult.success && refreshResult.accessToken) {
        return refreshResult.accessToken;
      }
      return null;
    }

    return tokens.accessToken;
  }

  /**
   * Refresh access token using refresh token
   * Uses Firebase Cloud Function to keep client_secret secure
   */
  private async refreshTokens(refreshToken: string): Promise<SquareAuthResult> {
    try {
      const refreshSquareToken = httpsCallable<
        { refreshToken: string },
        { accessToken: string; refreshToken: string; merchantId: string; expiresAt: string }
      >(functions, 'refreshSquareToken');

      const result = await refreshSquareToken({ refreshToken });

      const { accessToken, refreshToken: newRefreshToken, merchantId, expiresAt } = result.data;
      const expiresAtDate = new Date(expiresAt);

      // Store new tokens securely
      await this.storeTokens({
        accessToken,
        refreshToken: newRefreshToken,
        merchantId,
        expiresAt: expiresAtDate,
      });

      return {
        success: true,
        accessToken,
        refreshToken: newRefreshToken,
        merchantId,
        expiresAt: expiresAtDate,
      };
    } catch (error: any) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: error.message || 'Failed to refresh token',
      };
    }
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
