import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

// Define secrets (set these via: firebase functions:secrets:set SQUARE_CLIENT_SECRET)
const squareClientSecret = defineSecret("SQUARE_CLIENT_SECRET");
const squareClientId = defineSecret("SQUARE_CLIENT_ID");

interface TokenExchangeRequest {
  code: string;
  redirectUri: string;
}

interface SquareTokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  merchant_id: string;
  refresh_token: string;
}

/**
 * Exchange Square OAuth authorization code for access tokens
 * This keeps the client_secret secure on the server side
 */
export const exchangeSquareToken = onCall(
  {
    secrets: [squareClientSecret, squareClientId],
    cors: true,
  },
  async (request: CallableRequest<TokenExchangeRequest>) => {
    // Note: Auth check removed to allow guest users to connect Square
    // The Square OAuth flow itself provides authentication

    const { code, redirectUri } = request.data;

    if (!code) {
      throw new HttpsError("invalid-argument", "Authorization code is required");
    }

    if (!redirectUri) {
      throw new HttpsError("invalid-argument", "Redirect URI is required");
    }

    try {
      // Exchange the authorization code for tokens
      const response = await fetch("https://connect.squareup.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": "2024-01-18",
        },
        body: JSON.stringify({
          client_id: squareClientId.value(),
          client_secret: squareClientSecret.value(),
          code: code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Square token exchange error:", JSON.stringify(errorData, null, 2));
        console.error("Request details - redirectUri:", redirectUri);
        // Return more specific error from Square
        const errorMessage = errorData.errors?.[0]?.detail
          || errorData.message
          || errorData.error_description
          || `Square API error: ${response.status}`;
        throw new HttpsError("internal", errorMessage);
      }

      const tokenData: SquareTokenResponse = await response.json();

      // Return the tokens to the client
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        merchantId: tokenData.merchant_id,
        expiresAt: tokenData.expires_at,
      };
    } catch (error) {
      console.error("Token exchange error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to exchange authorization code");
    }
  }
);

interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Refresh Square access token using refresh token
 */
export const refreshSquareToken = onCall(
  {
    secrets: [squareClientSecret, squareClientId],
    cors: true,
  },
  async (request: CallableRequest<RefreshTokenRequest>) => {
    // Note: Auth check removed to allow guest users

    const { refreshToken } = request.data;

    if (!refreshToken) {
      throw new HttpsError("invalid-argument", "Refresh token is required");
    }

    try {
      const response = await fetch("https://connect.squareup.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": "2024-01-18",
        },
        body: JSON.stringify({
          client_id: squareClientId.value(),
          client_secret: squareClientSecret.value(),
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Square token refresh error:", errorData);
        throw new HttpsError(
          "internal",
          errorData.message || "Failed to refresh token"
        );
      }

      const tokenData: SquareTokenResponse = await response.json();

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        merchantId: tokenData.merchant_id,
        expiresAt: tokenData.expires_at,
      };
    } catch (error) {
      console.error("Token refresh error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Failed to refresh token");
    }
  }
);
