/**
 * Recipe Import Service
 * Orchestrates the entire recipe import flow:
 * 1. OCR extraction
 * 2. Claude API parsing
 * 3. Validation
 * 4. Confidence scoring
 */

import type { Recipe, RecipeSource, ParsedRecipeResponse } from '../types/recipe';
import type { POSIngredient } from '../types/pos';
import { CloudOCRService, type CloudOCRConfig } from './ocr/cloud-ocr.service';
import { ClaudeRecipeParserService, type ClaudeConfig } from './recipe-parser/claude-parser.service';
import { RecipeValidator } from '../utils/validation/recipe-validator';

export interface RecipeImportConfig {
  ocrConfig: CloudOCRConfig;
  claudeConfig: ClaudeConfig;
}

export interface ImportProgress {
  step: 'ocr' | 'parsing' | 'validation' | 'complete' | 'error';
  message: string;
  progress: number; // 0-100
}

export class RecipeImportService {
  private ocrService: CloudOCRService;
  private parserService: ClaudeRecipeParserService;

  constructor(config: RecipeImportConfig) {
    this.ocrService = new CloudOCRService(config.ocrConfig);
    this.parserService = new ClaudeRecipeParserService(config.claudeConfig);
  }

  /**
   * Import recipe from image/photo
   * Full pipeline: OCR -> Parse -> Validate
   */
  async importRecipeFromImage(
    imageUri: string,
    posIngredients: POSIngredient[],
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ParsedRecipeResponse> {
    try {
      // Step 1: OCR Extraction
      onProgress?.({
        step: 'ocr',
        message: 'Extracting text from image...',
        progress: 10,
      });

      const ocrResult = await this.ocrService.extractTextFromImage(imageUri);

      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        throw new Error('No text found in image. Please ensure the image is clear and try again.');
      }

      onProgress?.({
        step: 'ocr',
        message: 'Text extracted successfully',
        progress: 30,
      });

      // Step 2: Parse with Claude
      onProgress?.({
        step: 'parsing',
        message: 'Parsing recipe with AI...',
        progress: 40,
      });

      const source: RecipeSource = {
        type: 'photo',
        uri: imageUri,
        uploadedAt: new Date(),
      };

      const parsedRecipe = await this.parserService.parseRecipe(ocrResult.text, source, posIngredients);

      onProgress?.({
        step: 'parsing',
        message: 'Recipe parsed successfully',
        progress: 70,
      });

      // Step 3: Validate
      onProgress?.({
        step: 'validation',
        message: 'Validating recipe data...',
        progress: 80,
      });

      const validationIssues = RecipeValidator.validateRecipe(parsedRecipe.recipe, posIngredients);

      // Add validation issues to recipe
      parsedRecipe.recipe.issues = [...parsedRecipe.recipe.issues, ...validationIssues];

      // Recalculate confidence based on validation
      parsedRecipe.recipe.confidence = RecipeValidator.calculateConfidence(parsedRecipe.recipe);

      // Update status based on issues
      if (parsedRecipe.recipe.issues.length === 0) {
        parsedRecipe.recipe.status = 'ready_to_import';
      } else {
        parsedRecipe.recipe.status = 'needs_review';
      }

      onProgress?.({
        step: 'complete',
        message: 'Recipe import complete',
        progress: 100,
      });

      return parsedRecipe;
    } catch (error) {
      onProgress?.({
        step: 'error',
        message: `Import failed: ${error}`,
        progress: 0,
      });
      throw error;
    }
  }

  /**
   * Import recipe from text (direct paste)
   */
  async importRecipeFromText(
    text: string,
    posIngredients: POSIngredient[],
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ParsedRecipeResponse> {
    try {
      onProgress?.({
        step: 'parsing',
        message: 'Parsing recipe text...',
        progress: 30,
      });

      const source: RecipeSource = {
        type: 'text',
        content: text,
        uploadedAt: new Date(),
      };

      const parsedRecipe = await this.parserService.parseRecipe(text, source, posIngredients);

      onProgress?.({
        step: 'validation',
        message: 'Validating recipe...',
        progress: 70,
      });

      const validationIssues = RecipeValidator.validateRecipe(parsedRecipe.recipe, posIngredients);
      parsedRecipe.recipe.issues = [...parsedRecipe.recipe.issues, ...validationIssues];
      parsedRecipe.recipe.confidence = RecipeValidator.calculateConfidence(parsedRecipe.recipe);

      if (parsedRecipe.recipe.issues.length === 0) {
        parsedRecipe.recipe.status = 'ready_to_import';
      } else {
        parsedRecipe.recipe.status = 'needs_review';
      }

      onProgress?.({
        step: 'complete',
        message: 'Recipe import complete',
        progress: 100,
      });

      return parsedRecipe;
    } catch (error) {
      onProgress?.({
        step: 'error',
        message: `Import failed: ${error}`,
        progress: 0,
      });
      throw error;
    }
  }

  /**
   * Re-parse existing recipe with updated ingredients
   * Useful when POS ingredient list is updated
   */
  async revalidateRecipe(recipe: Recipe, posIngredients: POSIngredient[]): Promise<Recipe> {
    const validationIssues = RecipeValidator.validateRecipe(recipe, posIngredients);
    recipe.issues = validationIssues;
    recipe.confidence = RecipeValidator.calculateConfidence(recipe);
    recipe.lastUpdated = new Date();

    if (recipe.issues.length === 0) {
      recipe.status = 'ready_to_import';
    } else {
      recipe.status = 'needs_review';
    }

    return recipe;
  }
}

// Factory function
export function createRecipeImportService(config: RecipeImportConfig): RecipeImportService {
  return new RecipeImportService(config);
}
