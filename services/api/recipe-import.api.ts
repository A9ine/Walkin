import type { Recipe, Ingredient, RecipeIssue, ConfidenceLevel } from '@/types/recipe';
import type { POSIngredient } from '@/types/pos';
import * as FileSystem from 'expo-file-system';

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

  try {
    // Read image as base64
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Call Google Cloud Vision API
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

    if (data.responses && data.responses[0].textAnnotations) {
      return data.responses[0].textAnnotations[0].description || '';
    }

    throw new Error('No text found in image');
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract text from image');
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
  const criticalIssues = issues.filter((issue) =>
    issue.type === 'ingredient_not_found' || issue.type === 'unit_unclear'
  ).length;

  const matchRate = totalIngredients > 0 ? matchedIngredients / totalIngredients : 0;

  if (matchRate >= 0.9 && criticalIssues === 0) return 'high';
  if (matchRate >= 0.7 && criticalIssues <= 1) return 'medium';
  return 'low';
}

/**
 * Match ingredient to POS inventory using fuzzy matching
 */
function matchIngredientToPOS(
  ingredientName: string,
  posIngredients: POSIngredient[]
): { ingredient: POSIngredient | null; similarity: number } {
  let bestMatch: POSIngredient | null = null;
  let bestSimilarity = 0;

  const normalizedName = ingredientName.toLowerCase().trim();

  for (const posIng of posIngredients) {
    // Check exact match
    if (posIng.name.toLowerCase() === normalizedName) {
      return { ingredient: posIng, similarity: 1.0 };
    }

    // Check aliases
    if (posIng.aliases) {
      for (const alias of posIng.aliases) {
        if (alias.toLowerCase() === normalizedName) {
          return { ingredient: posIng, similarity: 1.0 };
        }
      }
    }

    // Calculate similarity (simple word matching for now)
    const similarity = calculateSimilarity(normalizedName, posIng.name.toLowerCase());

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = posIng;
    }

    // Check aliases for similarity
    if (posIng.aliases) {
      for (const alias of posIng.aliases) {
        const aliasSimilarity = calculateSimilarity(normalizedName, alias.toLowerCase());
        if (aliasSimilarity > bestSimilarity) {
          bestSimilarity = aliasSimilarity;
          bestMatch = posIng;
        }
      }
    }
  }

  // Return match only if similarity is above threshold
  return bestSimilarity >= 0.7 ? { ingredient: bestMatch, similarity: bestSimilarity } : { ingredient: null, similarity: 0 };
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
    // Build ingredient list for Claude
    const ingredientList = posIngredients
      .map((ing) => {
        const aliases = ing.aliases ? ` (aliases: ${ing.aliases.join(', ')})` : '';
        return `- ${ing.name} [${ing.unit}]${aliases}`;
      })
      .join('\n');

    const prompt = `You are a recipe parser. Extract the recipe information from the following text and match ingredients to the POS inventory.

OCR Text:
${ocrText}

POS Inventory:
${ingredientList}

Parse the recipe and return a JSON object with:
1. "name": The recipe name
2. "ingredients": Array of ingredients with:
   - "name": Ingredient name (match to POS inventory if possible)
   - "quantity": Numeric amount
   - "unit": Unit of measurement
   - "posIngredientId": The ID from POS inventory if matched (null if new)
   - "isNew": true if ingredient is not in POS inventory

Return ONLY valid JSON, no other text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
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

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to parse recipe with Claude');
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

      if (match.ingredient) {
        ingredients.push({
          name: match.ingredient.name,
          quantity: ing.quantity,
          unit: match.ingredient.unit,
          posIngredientId: match.ingredient.id,
          isNew: false,
          confidence: match.similarity >= 0.95 ? 'high' : match.similarity >= 0.8 ? 'medium' : 'low',
        });

        if (match.similarity < 0.95) {
          issues.push({
            type: 'similar_ingredient',
            message: `"${ing.name}" matched to "${match.ingredient.name}" (${Math.round(match.similarity * 100)}% confidence)`,
            ingredientName: ing.name,
            suggestedFix: `Verify that "${ing.name}" should be "${match.ingredient.name}"`,
          });
        }
      } else {
        ingredients.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          isNew: true,
          confidence: 'low',
        });

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
  } catch (error) {
    console.error('Claude parsing error:', error);
    throw new Error('Failed to parse recipe with AI');
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
