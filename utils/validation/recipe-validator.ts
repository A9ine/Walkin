import type { Recipe, Ingredient, RecipeIssue, ConfidenceLevel } from '../../types/recipe';
import type { POSIngredient } from '../../types/pos';

export class RecipeValidator {
  /**
   * Validate a recipe and return any issues found
   */
  static validateRecipe(recipe: Recipe, posIngredients: POSIngredient[]): RecipeIssue[] {
    const issues: RecipeIssue[] = [];

    // Validate basic recipe info
    if (!recipe.name || recipe.name.trim().length === 0) {
      issues.push({
        type: 'missing_data',
        message: 'Recipe name is missing',
      });
    }

    // Validate ingredients
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      issues.push({
        type: 'missing_data',
        message: 'Recipe has no ingredients',
      });
    } else {
      recipe.ingredients.forEach((ingredient) => {
        const ingredientIssues = this.validateIngredient(ingredient, posIngredients);
        issues.push(...ingredientIssues);
      });
    }

    return issues;
  }

  /**
   * Validate a single ingredient
   */
  static validateIngredient(ingredient: Ingredient, posIngredients: POSIngredient[]): RecipeIssue[] {
    const issues: RecipeIssue[] = [];

    // Check if ingredient name is missing
    if (!ingredient.name || ingredient.name.trim().length === 0) {
      issues.push({
        type: 'missing_data',
        message: 'Ingredient name is missing',
      });
      return issues;
    }

    // Check if quantity is valid
    if (ingredient.quantity <= 0 || isNaN(ingredient.quantity)) {
      issues.push({
        type: 'missing_data',
        message: `Invalid quantity for ${ingredient.name}`,
        ingredientName: ingredient.name,
      });
    }

    // Check if unit is specified
    if (!ingredient.unit || ingredient.unit.trim().length === 0) {
      issues.push({
        type: 'unit_unclear',
        message: `Unit not specified for ${ingredient.name}`,
        ingredientName: ingredient.name,
        suggestedFix: 'Please specify a unit (oz, cup, tsp, etc.)',
      });
    }

    // Check if ingredient exists in POS
    if (!ingredient.posIngredientId) {
      const similarIngredients = this.findSimilarIngredients(ingredient.name, posIngredients);

      if (similarIngredients.length > 0) {
        issues.push({
          type: 'similar_ingredient',
          message: `"${ingredient.name}" not found. Similar: ${similarIngredients.map((i) => i.name).join(', ')}`,
          ingredientName: ingredient.name,
          suggestedFix: `Link to existing ingredient or create new one`,
        });
      } else {
        issues.push({
          type: 'ingredient_not_found',
          message: `"${ingredient.name}" not found in POS inventory`,
          ingredientName: ingredient.name,
          suggestedFix: 'Create new ingredient in POS',
        });
      }
    }

    return issues;
  }

  /**
   * Find ingredients with similar names (fuzzy matching)
   */
  static findSimilarIngredients(ingredientName: string, posIngredients: POSIngredient[]): POSIngredient[] {
    const normalizedName = this.normalizeIngredientName(ingredientName);

    return posIngredients.filter((posIng) => {
      const normalizedPOSName = this.normalizeIngredientName(posIng.name);

      // Check exact match
      if (normalizedPOSName === normalizedName) {
        return true;
      }

      // Check aliases
      if (posIng.aliases) {
        const aliasMatch = posIng.aliases.some(
          (alias) => this.normalizeIngredientName(alias) === normalizedName
        );
        if (aliasMatch) return true;
      }

      // Check if one contains the other
      if (normalizedPOSName.includes(normalizedName) || normalizedName.includes(normalizedPOSName)) {
        return true;
      }

      // Check Levenshtein distance for typos
      const distance = this.levenshteinDistance(normalizedName, normalizedPOSName);
      const maxLength = Math.max(normalizedName.length, normalizedPOSName.length);
      const similarity = 1 - distance / maxLength;

      return similarity > 0.7; // 70% similarity threshold
    });
  }

  /**
   * Calculate confidence level for a recipe
   */
  static calculateConfidence(recipe: Recipe): ConfidenceLevel {
    let score = 100;

    // Deduct points for missing POS ingredients
    const missingIngredients = recipe.ingredients.filter((ing) => !ing.posIngredientId).length;
    score -= missingIngredients * 15;

    // Deduct points for unclear units
    const unclearUnits = recipe.ingredients.filter(
      (ing) => !ing.unit || !this.isValidUnit(ing.unit)
    ).length;
    score -= unclearUnits * 10;

    // Deduct points for other issues
    score -= recipe.issues.length * 5;

    // Determine confidence level
    if (score >= 85) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  /**
   * Check if unit is valid
   */
  static isValidUnit(unit: string): boolean {
    const validUnits = ['oz', 'cup', 'tsp', 'tbsp', 'each', 'lb', 'g', 'ml', 'l', 'gallon', 'quart', 'pint'];
    return validUnits.includes(unit.toLowerCase());
  }

  /**
   * Normalize ingredient name for comparison
   */
  private static normalizeIngredientName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Calculate Levenshtein distance (string similarity)
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}
