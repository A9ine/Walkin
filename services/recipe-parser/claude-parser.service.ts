import type {
  Recipe,
  Ingredient,
  RecipeIssue,
  ParsedRecipeResponse,
  ConfidenceLevel,
  RecipeSource,
} from '../../types/recipe';
import type { POSIngredient } from '../../types/pos';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeAPIResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeRecipeParserService {
  private config: ClaudeConfig;
  private readonly CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
  private readonly MODEL = 'claude-3-5-sonnet-20241022'; // Latest Claude model

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  /**
   * Parse recipe text into structured format
   * @param ocrText - Extracted text from OCR
   * @param source - Original source of the recipe
   * @param posIngredients - Master list of ingredients from POS system
   */
  async parseRecipe(
    ocrText: string,
    source: RecipeSource,
    posIngredients: POSIngredient[]
  ): Promise<ParsedRecipeResponse> {
    try {
      // Create prompt for Claude
      const prompt = this.buildParsePrompt(ocrText, posIngredients);

      // Call Claude API
      const response = await this.callClaudeAPI(prompt);

      // Parse Claude's response
      const parsedData = this.extractJSONFromResponse(response);

      // Build recipe object
      const recipe = this.buildRecipeFromParsedData(parsedData, source, posIngredients);

      return {
        recipe,
        rawParsedData: parsedData,
        parseConfidence: recipe.confidence,
      };
    } catch (error) {
      console.error('Recipe parsing error:', error);
      throw new Error(`Failed to parse recipe: ${error}`);
    }
  }

  /**
   * Build the prompt for Claude to parse the recipe
   */
  private buildParsePrompt(ocrText: string, posIngredients: POSIngredient[]): string {
    const ingredientList = posIngredients.map((ing) => `${ing.name} (${ing.unit})`).join(', ');

    return `You are a recipe parser for a POS inventory system. Extract the recipe information from the following text and return it as JSON.

OCR Text:
${ocrText}

Available POS Ingredients (for matching):
${ingredientList}

Return ONLY valid JSON with this exact structure:
{
  "recipeName": "Name of the recipe",
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": 2.5,
      "unit": "cup",
      "matchedPOSIngredient": "Exact name from POS list or null",
      "confidence": "high|medium|low",
      "issues": ["any issues with this ingredient"]
    }
  ],
  "variations": [
    {
      "name": "Size variation (e.g., Small, Medium, Large)",
      "ingredients": [same structure as above]
    }
  ],
  "overallConfidence": "high|medium|low"
}

Rules:
1. Match ingredients to the POS ingredient list when possible (fuzzy matching is OK)
2. Standardize units to: oz, cup, tsp, tbsp, each, lb, g, ml, l, gallon, quart, pint
3. If unit is unclear, use "each" and add an issue
4. Set confidence to:
   - "high": All ingredients matched, units clear
   - "medium": Some ingredients matched or units slightly unclear
   - "low": Many unmatched ingredients or unclear data
5. Add issues for: unclear units, unmatched ingredients, similar ingredient names
6. Extract size variations (S/M/L) as separate variations if found
7. If no variations found, leave variations array empty

Return ONLY the JSON, no other text.`;
  }

  /**
   * Call Claude API
   */
  private async callClaudeAPI(prompt: string): Promise<ClaudeAPIResponse> {
    const response = await fetch(this.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model || this.MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  }

  /**
   * Extract JSON from Claude's response
   */
  private extractJSONFromResponse(response: ClaudeAPIResponse): any {
    const textContent = response.content.find((c) => c.type === 'text')?.text || '';

    try {
      // Try to parse as JSON directly
      return JSON.parse(textContent);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/) || textContent.match(/```\n([\s\S]*?)\n```/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Last resort: try to find JSON object in the text
      const objectMatch = textContent.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      throw new Error('Could not extract valid JSON from Claude response');
    }
  }

  /**
   * Build Recipe object from parsed data
   */
  private buildRecipeFromParsedData(
    parsedData: any,
    source: RecipeSource,
    posIngredients: POSIngredient[]
  ): Recipe {
    const now = new Date();
    const recipeId = this.generateId();

    // Process ingredients
    const ingredients: Ingredient[] = parsedData.ingredients.map((ing: any) => {
      const matchedPOS = posIngredients.find((pos) => pos.name === ing.matchedPOSIngredient);

      return {
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        posIngredientId: matchedPOS?.id,
        isNew: !matchedPOS,
        confidence: ing.confidence,
        issues: ing.issues || [],
      };
    });

    // Determine overall issues
    const issues: RecipeIssue[] = [];

    ingredients.forEach((ing) => {
      if (ing.isNew) {
        issues.push({
          type: 'ingredient_not_found',
          message: `Ingredient "${ing.name}" not found in POS system`,
          ingredientName: ing.name,
          suggestedFix: 'Create new ingredient or match to existing',
        });
      }

      if (ing.issues && ing.issues.length > 0) {
        ing.issues.forEach((issue) => {
          issues.push({
            type: 'unit_unclear',
            message: issue,
            ingredientName: ing.name,
          });
        });
      }
    });

    // Determine status
    let status: Recipe['status'] = 'ready_to_import';
    if (issues.length > 0) {
      status = 'needs_review';
    }

    return {
      id: recipeId,
      name: parsedData.recipeName,
      status,
      confidence: parsedData.overallConfidence,
      lastUpdated: now,
      source,
      ingredients,
      variations: parsedData.variations?.map((v: any) => ({
        id: this.generateId(),
        name: v.name,
        ingredients: v.ingredients,
      })),
      issues,
      createdAt: now,
    };
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Factory function
export function createClaudeParser(config: ClaudeConfig): ClaudeRecipeParserService {
  return new ClaudeRecipeParserService(config);
}
