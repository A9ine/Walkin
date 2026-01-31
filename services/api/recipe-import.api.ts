import type { Recipe, Ingredient, RecipeIssue, ConfidenceLevel, UnitConversion } from '@/types/recipe';
import type { POSIngredient } from '@/types/pos';
import * as FileSystem from 'expo-file-system/legacy';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

interface ImportProgress {
  stage: 'ocr' | 'parsing' | 'validation' | 'saving';
  progress: number;
  message: string;
}

export interface RecipeImportResult {
  success: boolean;
  recipe?: Recipe;
  error?: string;
}

/**
 * OCR Service - Extract text from images using Google Cloud Vision
 */
async function extractTextFromImage(imageUri: string): Promise<string> {
  if (!GOOGLE_VISION_API_KEY) {
    throw new Error('Google Vision API key not configured');
  }

  console.log('Starting OCR for image:', imageUri);
  console.log('API Key configured:', GOOGLE_VISION_API_KEY ? 'Yes (length: ' + GOOGLE_VISION_API_KEY.length + ')' : 'No');

  let base64Image: string;

  // Step 1: Read image as base64
  try {
    console.log('Reading image as base64...');
    console.log('Image URI:', imageUri);

    // Copy to cache directory first for reliable access (handles iOS photo library URIs)
    const filename = `temp_${Date.now()}.jpg`;
    const cacheUri = `${FileSystem.cacheDirectory}${filename}`;
    console.log('Copying image to cache:', cacheUri);

    await FileSystem.copyAsync({ from: imageUri, to: cacheUri });
    console.log('Copy successful, reading as base64...');

    base64Image = await FileSystem.readAsStringAsync(cacheUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('Base64 image size:', Math.round(base64Image.length / 1024), 'KB');

    // Clean up temp file
    FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
  } catch (readError: any) {
    console.error('Failed to read image file:', readError);
    throw new Error(`Cannot read image file: ${readError?.message || 'Unknown error'}`);
  }

  // Step 2: Call Google Vision API
  try {

    // Warn if image is very large (over 4MB base64 = ~3MB image)
    if (base64Image.length > 4 * 1024 * 1024) {
      console.warn('Image is very large, may cause issues');
    }

    // Call Google Cloud Vision API
    console.log('Calling Google Vision API...');
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // Log the full response for debugging
    console.log('Google Vision API response:', JSON.stringify(data, null, 2));

    if (data.error) {
      throw new Error(`Google Vision API error: ${data.error.message}`);
    }

    if (data.responses && data.responses[0].textAnnotations) {
      return data.responses[0].textAnnotations[0].description || '';
    }

    if (data.responses && data.responses[0].error) {
      throw new Error(`Vision API error: ${data.responses[0].error.message}`);
    }

    throw new Error('No text found in image');
  } catch (error: any) {
    console.error('OCR Error:', error);
    console.error('OCR Error message:', error?.message);
    console.error('OCR Error stack:', error?.stack);
    // Preserve the original error message
    throw new Error(error?.message || 'Failed to extract text from image');
  }
}

/**
 * Calculate confidence level based on matching quality
 */
function calculateConfidence(
  ingredients: Ingredient[],
  issues: RecipeIssue[]
): ConfidenceLevel {
  const totalIngredients = ingredients.length;
  const matchedIngredients = ingredients.filter((ing) => ing.posIngredientId).length;
  const unclearUnits = ingredients.filter((ing) => ing.unitUnclear).length;
  const criticalIssues = issues.filter((issue) =>
    issue.type === 'ingredient_not_found' || issue.type === 'unit_unclear'
  ).length;

  const matchRate = totalIngredients > 0 ? matchedIngredients / totalIngredients : 0;
  const unitClearRate = totalIngredients > 0 ? (totalIngredients - unclearUnits) / totalIngredients : 1;

  // High confidence: 90%+ matched, no critical issues, all units clear
  if (matchRate >= 0.9 && criticalIssues === 0 && unitClearRate === 1) return 'high';
  // Medium confidence: 70%+ matched, 1 or fewer critical issues, 80%+ units clear
  if (matchRate >= 0.7 && criticalIssues <= 1 && unitClearRate >= 0.8) return 'medium';
  return 'low';
}

/**
 * Match ingredient to POS inventory using fuzzy matching
 * 100% matches (exact name or alias, case-insensitive) are auto-matched
 */
function matchIngredientToPOS(
  ingredientName: string,
  posIngredients: POSIngredient[]
): { ingredient: POSIngredient | null; similarity: number; isExactMatch: boolean } {
  let bestMatch: POSIngredient | null = null;
  let bestSimilarity = 0;

  const normalizedName = ingredientName.toLowerCase().trim();

  for (const posIng of posIngredients) {
    const posIngNormalized = posIng.name.toLowerCase().trim();

    // Check exact match on name (100% match - auto-link)
    if (posIngNormalized === normalizedName) {
      console.log(`Exact match found: "${ingredientName}" -> "${posIng.name}"`);
      return { ingredient: posIng, similarity: 1.0, isExactMatch: true };
    }

    // Check exact match on aliases (100% match - auto-link)
    if (posIng.aliases) {
      for (const alias of posIng.aliases) {
        if (alias.toLowerCase().trim() === normalizedName) {
          console.log(`Exact alias match found: "${ingredientName}" -> "${posIng.name}" (via alias "${alias}")`);
          return { ingredient: posIng, similarity: 1.0, isExactMatch: true };
        }
      }
    }

    // Calculate similarity (simple word matching for now)
    const similarity = calculateSimilarity(normalizedName, posIngNormalized);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = posIng;
    }

    // Check aliases for similarity
    if (posIng.aliases) {
      for (const alias of posIng.aliases) {
        const aliasSimilarity = calculateSimilarity(normalizedName, alias.toLowerCase().trim());
        if (aliasSimilarity > bestSimilarity) {
          bestSimilarity = aliasSimilarity;
          bestMatch = posIng;
        }
      }
    }
  }

  // Return match only if similarity is above threshold
  return bestSimilarity >= 0.7
    ? { ingredient: bestMatch, similarity: bestSimilarity, isExactMatch: false }
    : { ingredient: null, similarity: 0, isExactMatch: false };
}

/**
 * Calculate simple word similarity score
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);

  let matchCount = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / Math.max(words1.length, words2.length);
}

/**
 * Parse recipe using Claude API
 */
async function parseRecipeWithClaude(
  ocrText: string,
  posIngredients: POSIngredient[]
): Promise<{ name: string; ingredients: Ingredient[]; issues: RecipeIssue[] }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }

  try {
    // Build ingredient list for Claude with supported units
    const ingredientList = posIngredients
      .map((ing) => {
        const aliases = ing.aliases ? ` (aliases: ${ing.aliases.join(', ')})` : '';
        const units = ing.supportedUnits
          ? ing.supportedUnits.map(u => u.unit).join(', ')
          : ing.unit;
        return `- ${ing.name} [units: ${units}]${aliases}`;
      })
      .join('\n');

    // Standard units for reference
    const standardUnits = ['oz', 'cup', 'tsp', 'tbsp', 'each', 'lb', 'g', 'ml', 'l', 'gallon', 'quart', 'pint', 'kg', 'fl oz'];

    const prompt = `You are a recipe parser. Extract the recipe information from the following text and match ingredients to the POS inventory.

OCR Text:
${ocrText}

POS Inventory (with supported units):
${ingredientList}

Standard units: ${standardUnits.join(', ')}

Parse the recipe and return a JSON object with:
1. "name": The recipe name
2. "ingredients": Array of ingredients with:
   - "name": Ingredient name (match to POS inventory if possible)
   - "quantity": Numeric amount (convert fractions like "1/2" to decimals like 0.5)
   - "unit": Normalized unit of measurement (use standard units when possible)
   - "originalUnit": The exact unit text as it appeared in the recipe (before normalization)
   - "unitUnclear": true if the unit is missing, ambiguous, or couldn't be determined confidently
   - "posIngredientId": The ID from POS inventory if matched (null if new)
   - "isNew": true if ingredient is not in POS inventory

IMPORTANT for units:
- If no unit is specified (e.g., "2 eggs"), use "each" and set unitUnclear: false
- If the unit is abbreviated or unclear (e.g., "c" could be cup, "T" could be tbsp), normalize it but set unitUnclear: true
- If unit cannot be determined at all, use the original text and set unitUnclear: true
- Common abbreviations: c/C = cup, t/tsp = teaspoon, T/tbsp/Tbsp = tablespoon, oz = ounce, lb = pound, g = gram

Return ONLY valid JSON, no other text.`;

    console.log('Calling Claude API...');
    console.log('API Key configured:', ANTHROPIC_API_KEY ? 'Yes (length: ' + ANTHROPIC_API_KEY.length + ')' : 'No');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const data = await response.json();
    console.log('Claude API response status:', response.status);
    console.log('Claude API response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(data.error?.message || `Claude API error: ${response.status}`);
    }

    // Extract JSON from Claude's response
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Match ingredients and detect issues
    const ingredients: Ingredient[] = [];
    const issues: RecipeIssue[] = [];

    for (const ing of parsed.ingredients) {
      const match = matchIngredientToPOS(ing.name, posIngredients);
      const unitUnclear = ing.unitUnclear === true;
      const originalUnit = ing.originalUnit || ing.unit;

      if (match.ingredient) {
        // Check if the parsed unit is compatible with the POS ingredient's supported units
        const parsedUnit = ing.unit?.toLowerCase();
        const supportedUnits = match.ingredient.supportedUnits || [{ unit: match.ingredient.unit, conversionFactor: 1 }];
        const unitMatch = supportedUnits.find(u => u.unit.toLowerCase() === parsedUnit);

        // For exact matches (100%), use high confidence and auto-link without issues
        const isAutoMatched = match.isExactMatch;

        ingredients.push({
          name: match.ingredient.name, // Use the POS ingredient name for consistency
          quantity: ing.quantity,
          unit: unitMatch ? unitMatch.unit : ing.unit || match.ingredient.unit,
          originalUnit: originalUnit,
          unitUnclear: isAutoMatched ? false : unitUnclear, // Clear unit unclear for exact matches
          supportedUnits: supportedUnits.map(u => ({ unit: u.unit, conversionFactor: u.conversionFactor })),
          posIngredientId: match.ingredient.id,
          isNew: false,
          confidence: isAutoMatched ? 'high' : (match.similarity >= 0.95 && !unitUnclear ? 'high' : match.similarity >= 0.8 ? 'medium' : 'low'),
        });

        // Skip all issues for exact matches (100% auto-matched)
        if (!isAutoMatched) {
          // Flag unit issues only for non-exact matches
          if (unitUnclear) {
            issues.push({
              type: 'unit_unclear',
              message: `Unit unclear for "${ing.name}": "${originalUnit}" - please verify`,
              ingredientName: match.ingredient.name,
              suggestedFix: `Verify the unit for "${match.ingredient.name}" (detected: "${ing.unit}", original: "${originalUnit}")`,
            });
          } else if (!unitMatch && parsedUnit) {
            issues.push({
              type: 'unit_unclear',
              message: `Unit "${ing.unit}" not in supported units for "${match.ingredient.name}"`,
              ingredientName: match.ingredient.name,
              suggestedFix: `Convert "${ing.unit}" to one of: ${supportedUnits.map(u => u.unit).join(', ')}`,
            });
          }

          if (match.similarity < 0.95) {
            issues.push({
              type: 'similar_ingredient',
              message: `"${ing.name}" matched to "${match.ingredient.name}" (${Math.round(match.similarity * 100)}% confidence)`,
              ingredientName: match.ingredient.name,
              suggestedFix: `Verify that "${ing.name}" should be "${match.ingredient.name}"`,
            });
          }
        }
      } else {
        ingredients.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          originalUnit: originalUnit,
          unitUnclear: unitUnclear,
          isNew: true,
          confidence: 'low',
        });

        // Flag unit issues for new ingredients
        if (unitUnclear) {
          issues.push({
            type: 'unit_unclear',
            message: `Unit unclear for "${ing.name}": "${originalUnit}" - please verify`,
            ingredientName: ing.name,
            suggestedFix: `Specify the correct unit for "${ing.name}"`,
          });
        }

        issues.push({
          type: 'ingredient_not_found',
          message: `"${ing.name}" not found in inventory`,
          ingredientName: ing.name,
          suggestedFix: `Add "${ing.name}" to inventory or match to existing ingredient`,
        });
      }
    }

    return {
      name: parsed.name,
      ingredients,
      issues,
    };
  } catch (error: any) {
    console.error('Claude parsing error:', error);
    throw new Error(error?.message || 'Failed to parse recipe with AI');
  }
}

/**
 * Main import function - orchestrates OCR + Claude + validation
 */
export async function importRecipeFromImage(
  imageUri: string,
  posIngredients: POSIngredient[],
  onProgress?: (progress: ImportProgress) => void
): Promise<RecipeImportResult> {
  try {
    // Stage 1: OCR
    onProgress?.({
      stage: 'ocr',
      progress: 10,
      message: 'Extracting text from image...',
    });

    const ocrText = await extractTextFromImage(imageUri);

    onProgress?.({
      stage: 'ocr',
      progress: 30,
      message: 'Text extracted successfully',
    });

    // Stage 2: Claude Parsing
    onProgress?.({
      stage: 'parsing',
      progress: 40,
      message: 'Parsing recipe with AI...',
    });

    const parsed = await parseRecipeWithClaude(ocrText, posIngredients);

    onProgress?.({
      stage: 'parsing',
      progress: 70,
      message: 'Recipe parsed successfully',
    });

    // Stage 3: Validation
    onProgress?.({
      stage: 'validation',
      progress: 80,
      message: 'Validating recipe data...',
    });

    const confidence = calculateConfidence(parsed.ingredients, parsed.issues);
    const status = confidence === 'high' ? 'ready_to_import' : 'needs_review';

    const now = new Date();
    const recipe: Recipe = {
      id: `recipe_${Date.now()}`,
      name: parsed.name,
      status,
      confidence,
      lastUpdated: now,
      createdAt: now,
      source: {
        type: 'photo',
        uri: imageUri,
        uploadedAt: now,
      },
      ingredients: parsed.ingredients,
      issues: parsed.issues,
    };

    onProgress?.({
      stage: 'validation',
      progress: 100,
      message: 'Recipe ready to save',
    });

    return {
      success: true,
      recipe,
    };
  } catch (error) {
    console.error('Recipe import error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
