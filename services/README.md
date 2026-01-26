# Recipe Import Service - OCR + Claude API

This service handles the complete recipe import pipeline for the Walk-In System.

## Architecture

```
Photo/PDF/Text → OCR → Claude API → Validation → Recipe Object
```

### Flow:

1. **OCR Service** (`ocr/cloud-ocr.service.ts`)
   - Extracts text from images using Google Cloud Vision
   - Alternatives: AWS Textract, Azure Vision, or Tesseract.js

2. **Claude Parser** (`recipe-parser/claude-parser.service.ts`)
   - Parses OCR text into structured recipe data
   - Matches ingredients to POS master list
   - Handles variations (S/M/L sizes)
   - Assigns confidence scores

3. **Validator** (`utils/validation/recipe-validator.ts`)
   - Validates ingredient names, quantities, units
   - Finds similar ingredients (fuzzy matching)
   - Calculates final confidence score
   - Generates issues list

4. **Recipe Import Service** (`recipe-import.service.ts`)
   - Orchestrates the entire pipeline
   - Provides progress callbacks
   - Handles errors gracefully

## Setup

### 1. Install Dependencies

```bash
npm install expo-file-system expo-image-picker
```

### 2. Get API Keys

#### Claude API (Anthropic)
1. Go to https://console.anthropic.com/
2. Create an account
3. Get your API key from Settings
4. Copy to `config/env.ts`

#### Google Cloud Vision (OCR)
1. Go to https://console.cloud.google.com/
2. Enable Cloud Vision API
3. Create credentials (API Key)
4. Copy to `config/env.ts`

**Alternative OCR Options:**
- **AWS Textract**: Better for PDFs, more expensive
- **Azure Computer Vision**: Good accuracy, Microsoft ecosystem
- **Tesseract.js**: Free, runs locally, lower accuracy

### 3. Configure Environment

```bash
cp config/env.example.ts config/env.ts
```

Edit `config/env.ts` and add your API keys:

```typescript
export const config = {
  claude: {
    apiKey: 'sk-ant-xxxxx', // Your Anthropic API key
    model: 'claude-3-5-sonnet-20241022',
  },
  ocr: {
    provider: 'google',
    apiKey: 'AIzaSyxxxxx', // Your Google Cloud API key
  },
};
```

### 4. Add to .gitignore

```bash
echo "config/env.ts" >> .gitignore
```

## Usage

### Import from Image

```typescript
import { createRecipeImportService } from './services/recipe-import.service';
import { config } from './config/env';

const importService = createRecipeImportService({
  claudeConfig: config.claude,
  ocrConfig: config.ocr,
});

// Import recipe
const result = await importService.importRecipeFromImage(
  imageUri,
  posIngredients,
  (progress) => {
    console.log(progress.message); // "Extracting text from image..."
  }
);

// Check result
if (result.recipe.status === 'ready_to_import') {
  // ✅ Ready to send to POS
} else if (result.recipe.status === 'needs_review') {
  // ⚠️ Show issues to user
  result.recipe.issues.forEach(issue => {
    console.log(issue.message);
  });
}
```

### Import from Text

```typescript
const result = await importService.importRecipeFromText(
  recipeText,
  posIngredients
);
```

## Data Types

### Recipe Object
```typescript
interface Recipe {
  id: string;
  name: string;
  status: 'ready_to_import' | 'needs_review' | 'import_failed' | 'draft';
  confidence: 'high' | 'medium' | 'low';
  ingredients: Ingredient[];
  issues: RecipeIssue[];
  source: RecipeSource;
  // ... more fields
}
```

### Confidence Levels

- **High (Green)**: All ingredients matched, units clear, ready to import
- **Medium (Yellow)**: Some issues but mostly correct, needs quick review
- **Low (Red)**: Multiple issues, needs manual editing

## Cost Estimates

### Claude API (Anthropic)
- Input: ~$3 per million tokens
- Output: ~$15 per million tokens
- **Per recipe**: ~$0.01-0.03 (assuming 500-1500 tokens)

### Google Cloud Vision
- OCR detection: $1.50 per 1000 images (first 1000 free monthly)
- **Per recipe**: ~$0.0015

**Total per recipe**: ~$0.01-0.03

## Best Practices

1. **Cache OCR results**: Don't re-OCR the same image
2. **Batch processing**: Import multiple recipes together if possible
3. **Error handling**: Always handle API failures gracefully
4. **Progress feedback**: Use callbacks to show user progress
5. **Validate first**: Check image quality before sending to OCR

## Troubleshooting

### OCR returns empty text
- Image quality too low
- Text too small or blurry
- Try different lighting/angle
- Suggest user to retake photo

### Claude returns invalid JSON
- OCR text might be corrupted
- Try rephrasing the prompt
- Check API key validity

### Ingredients not matching
- Update POS ingredient list
- Add aliases to ingredients
- Lower fuzzy matching threshold

## Next Steps for MVP

1. ✅ OCR service setup
2. ✅ Claude API integration
3. ✅ Validation logic
4. ⏳ Square API integration (import to POS)
5. ⏳ React Native camera component
6. ⏳ Recipe detail UI screens
7. ⏳ Local database (SQLite or Async Storage)

## Files Structure

```
services/
├── ocr/
│   ├── cloud-ocr.service.ts      # Google Cloud Vision
│   └── tesseract.service.ts      # Local OCR (alternative)
├── recipe-parser/
│   └── claude-parser.service.ts  # Claude API integration
├── recipe-import.service.ts      # Main orchestration
└── example-usage.ts              # Usage examples

types/
├── recipe.ts                     # Recipe data types
└── pos.ts                        # POS integration types

utils/
└── validation/
    └── recipe-validator.ts       # Validation logic

config/
└── env.example.ts                # Config template
```
