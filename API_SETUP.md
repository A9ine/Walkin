# API Setup Guide

This guide explains how to set up the external APIs needed for the Walk-In System app.

## Required APIs

### 1. Anthropic Claude API (Required)
Used for parsing recipe text and matching ingredients to your POS inventory.

**Setup:**
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key and add to your `.env` file

**Pricing:**
- Claude 3.5 Sonnet: ~$3 per million input tokens, ~$15 per million output tokens
- Typical recipe parsing costs ~$0.01-0.03 per recipe

### 2. Google Cloud Vision API (Required)
Used for OCR (Optical Character Recognition) to extract text from recipe images.

**Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Cloud Vision API:
   - Search for "Cloud Vision API" in the API Library
   - Click "Enable"
4. Create credentials:
   - Go to "Credentials" in the left menu
   - Click "Create Credentials" → "API Key"
   - Copy the API key
5. (Optional) Restrict the API key to Cloud Vision API only for security

**Pricing:**
- First 1,000 requests per month: FREE
- After that: $1.50 per 1,000 requests
- Most users stay within free tier

### 3. Square POS API (Optional)
Used to sync with your Square POS system for menu items and ingredients.

**Setup:**
1. Go to [Square Developer Portal](https://developer.squareup.com/)
2. Create a new application
3. Get your Access Token from the Credentials tab
4. Get your Location ID from the Locations API
5. Add to `.env` file

**Note:** Square integration is optional. You can manually manage menu items and ingredients in the app.

## Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```
   EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-api03-...
   EXPO_PUBLIC_GOOGLE_VISION_API_KEY=AIza...
   EXPO_PUBLIC_SQUARE_ACCESS_TOKEN=EAAA... (optional)
   EXPO_PUBLIC_SQUARE_LOCATION_ID=L... (optional)
   ```

3. Restart your development server:
   ```bash
   npm start
   ```

## Using the Real API

Once you've configured your API keys, the app will automatically use the real OCR and Claude parsing when you:

1. Take a photo of a recipe on the Import tab
2. Upload an image from your gallery

The import process will:
1. Extract text from the image using Google Cloud Vision
2. Parse the recipe using Claude 3.5 Sonnet
3. Match ingredients to your POS inventory
4. Save to the local SQLite database

## Testing Without API Keys

If you don't have API keys set up, the app will continue to work with mock data:
- Mock recipe creation (current behavior)
- Pre-seeded ingredients and menu items
- All database features work normally

For testing purposes, you can use the **Text Import** feature which doesn't require any API keys - it lets you manually enter recipes with ingredient autocomplete.

## Cost Estimation

For a typical bakery processing 50 recipes per month:

| Service | Usage | Cost |
|---------|-------|------|
| Google Vision OCR | 50 images | FREE (under 1,000/month) |
| Claude API | 50 recipes | ~$1.50/month |
| **Total** | | **~$1.50/month** |

Most users will stay well under $5/month.

## Security Notes

⚠️ **NEVER commit your `.env` file to Git!**

The `.env` file is already in `.gitignore`. Your API keys should remain private.

For production deployment, use environment variables through your hosting provider (Expo EAS, Vercel, etc.) instead of a `.env` file.

## Troubleshooting

### "API key not configured" error
- Make sure your `.env` file exists and has the correct keys
- Restart your development server after adding keys
- Verify the key names match exactly: `EXPO_PUBLIC_ANTHROPIC_API_KEY`, etc.

### OCR not working
- Check that Google Cloud Vision API is enabled in your Google Cloud project
- Verify the API key has access to Cloud Vision API
- Check image quality - ensure text is clear and well-lit

### Claude parsing errors
- Verify your Anthropic API key is valid
- Check you have available credits in your Anthropic account
- Review the console logs for specific error messages

## Alternative OCR Options

If you don't want to use Google Cloud Vision, you can also use:

1. **Tesseract.js** (Free, offline)
   - No API key needed
   - Lower accuracy than Google Vision
   - Already implemented in `services/ocr/tesseract-ocr.service.ts`

2. **AWS Textract** (Pay per use)
   - Similar pricing to Google Vision
   - Good for production use

To switch OCR providers, update the import in `services/api/recipe-import.api.ts`.
