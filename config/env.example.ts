/**
 * Environment Configuration
 * Copy this file to env.ts and add your actual API keys
 */

export const config = {
  // Claude API (Anthropic)
  claude: {
    apiKey: 'YOUR_ANTHROPIC_API_KEY', // Get from: https://console.anthropic.com/
    model: 'claude-3-5-sonnet-20241022', // Latest model
  },

  // OCR Service (Google Cloud Vision)
  ocr: {
    provider: 'google' as const,
    apiKey: 'YOUR_GOOGLE_CLOUD_API_KEY', // Get from: https://console.cloud.google.com/
  },

  // Square POS (for MVP)
  square: {
    accessToken: 'YOUR_SQUARE_ACCESS_TOKEN',
    environment: 'sandbox' as 'sandbox' | 'production', // Use sandbox for testing
    applicationId: 'YOUR_SQUARE_APPLICATION_ID',
  },
};

// Don't commit env.ts to git!
// Add it to .gitignore
