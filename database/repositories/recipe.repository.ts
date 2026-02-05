import type { Recipe, Ingredient, RecipeIssue } from '@/types/recipe';
import { db } from '../db.service';
import { linkRecipeToMenuItem } from '@/utils/menu-recipe-linker';

export class RecipeRepository {
  /**
   * Save a new recipe to database
   */
  async saveRecipe(recipe: Recipe, userId: string): Promise<void> {
    const database = db.getDB();

    try {
      await database.runAsync('BEGIN TRANSACTION');

      // Insert recipe
      await database.runAsync(
        `INSERT INTO recipes (id, user_id, name, status, confidence, source_type, source_uri, source_content, pos_menu_item_id, created_at, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipe.id,
          userId,
          recipe.name,
          recipe.status,
          recipe.confidence,
          recipe.source.type,
          recipe.source.uri || null,
          recipe.source.content || null,
          recipe.posMenuItemId || null,
          recipe.createdAt.getTime(),
          recipe.lastUpdated.getTime(),
        ]
      );

      // Insert ingredients
      for (let i = 0; i < recipe.ingredients.length; i++) {
        const ing = recipe.ingredients[i];
        await database.runAsync(
          `INSERT INTO ingredients (id, recipe_id, name, quantity, unit, pos_ingredient_id, is_new, confidence, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `${recipe.id}_ing_${i}`,
            recipe.id,
            ing.name,
            ing.quantity,
            ing.unit,
            ing.posIngredientId || null,
            ing.isNew ? 1 : 0,
            ing.confidence || null,
            i,
          ]
        );
      }

      // Insert issues
      for (let i = 0; i < recipe.issues.length; i++) {
        const issue = recipe.issues[i];
        await database.runAsync(
          `INSERT INTO recipe_issues (id, recipe_id, type, message, ingredient_name, suggested_fix, duplicate_indices)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `${recipe.id}_issue_${i}`,
            recipe.id,
            issue.type,
            issue.message,
            issue.ingredientName || null,
            issue.suggestedFix || null,
            issue.duplicateIndices ? JSON.stringify(issue.duplicateIndices) : null,
          ]
        );
      }

      await database.runAsync('COMMIT');

      // After successful save, try to link recipe to menu item
      // Don't throw if this fails - recipe is already saved
      try {
        await linkRecipeToMenuItem(recipe);
      } catch (linkError) {
        console.error('Recipe saved but failed to link to menu item:', linkError);
        // Don't throw - the recipe was saved successfully
      }
    } catch (error) {
      await database.runAsync('ROLLBACK');
      console.error('Failed to save recipe:', error);
      throw error;
    }
  }

  /**
   * Get all recipes for a user
   */
  async getAllRecipes(userId: string): Promise<Recipe[]> {
    const database = db.getDB();

    const recipeRows = await database.getAllAsync<any>(
      'SELECT * FROM recipes WHERE user_id = ? ORDER BY last_updated DESC',
      [userId]
    );

    const recipes: Recipe[] = [];

    for (const row of recipeRows) {
      const recipe = await this.buildRecipeFromRow(row);
      recipes.push(recipe);
    }

    return recipes;
  }

  /**
   * Get recipes by status for a user
   */
  async getRecipesByStatus(userId: string, status: Recipe['status']): Promise<Recipe[]> {
    const database = db.getDB();

    const recipeRows = await database.getAllAsync<any>(
      'SELECT * FROM recipes WHERE user_id = ? AND status = ? ORDER BY last_updated DESC',
      [userId, status]
    );

    const recipes: Recipe[] = [];

    for (const row of recipeRows) {
      const recipe = await this.buildRecipeFromRow(row);
      recipes.push(recipe);
    }

    return recipes;
  }

  /**
   * Get recipe by ID
   */
  async getRecipeById(id: string): Promise<Recipe | null> {
    const database = db.getDB();

    const row = await database.getFirstAsync<any>('SELECT * FROM recipes WHERE id = ?', [id]);

    if (!row) return null;

    return this.buildRecipeFromRow(row);
  }

  /**
   * Update recipe status
   */
  async updateRecipeStatus(id: string, status: Recipe['status']): Promise<void> {
    const database = db.getDB();

    await database.runAsync('UPDATE recipes SET status = ?, last_updated = ? WHERE id = ?', [
      status,
      Date.now(),
      id,
    ]);
  }

  /**
   * Update an existing recipe
   */
  async updateRecipe(recipe: Recipe): Promise<void> {
    const database = db.getDB();

    try {
      await database.runAsync('BEGIN TRANSACTION');

      // Update recipe
      await database.runAsync(
        `UPDATE recipes SET name = ?, status = ?, confidence = ?, source_type = ?, source_uri = ?, source_content = ?, pos_menu_item_id = ?, last_updated = ?
         WHERE id = ?`,
        [
          recipe.name,
          recipe.status,
          recipe.confidence,
          recipe.source.type,
          recipe.source.uri || null,
          recipe.source.content || null,
          recipe.posMenuItemId || null,
          recipe.lastUpdated.getTime(),
          recipe.id,
        ]
      );

      // Delete existing ingredients and re-insert
      await database.runAsync('DELETE FROM ingredients WHERE recipe_id = ?', [recipe.id]);

      for (let i = 0; i < recipe.ingredients.length; i++) {
        const ing = recipe.ingredients[i];
        await database.runAsync(
          `INSERT INTO ingredients (id, recipe_id, name, quantity, unit, pos_ingredient_id, is_new, confidence, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `${recipe.id}_ing_${i}`,
            recipe.id,
            ing.name,
            ing.quantity,
            ing.unit,
            ing.posIngredientId || null,
            ing.isNew ? 1 : 0,
            ing.confidence || null,
            i,
          ]
        );
      }

      // Delete existing issues and re-insert
      await database.runAsync('DELETE FROM recipe_issues WHERE recipe_id = ?', [recipe.id]);

      for (let i = 0; i < recipe.issues.length; i++) {
        const issue = recipe.issues[i];
        await database.runAsync(
          `INSERT INTO recipe_issues (id, recipe_id, type, message, ingredient_name, suggested_fix, duplicate_indices)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `${recipe.id}_issue_${i}`,
            recipe.id,
            issue.type,
            issue.message,
            issue.ingredientName || null,
            issue.suggestedFix || null,
            issue.duplicateIndices ? JSON.stringify(issue.duplicateIndices) : null,
          ]
        );
      }

      await database.runAsync('COMMIT');
    } catch (error) {
      await database.runAsync('ROLLBACK');
      console.error('Failed to update recipe:', error);
      throw error;
    }
  }

  /**
   * Delete recipe
   */
  async deleteRecipe(id: string): Promise<void> {
    const database = db.getDB();
    await database.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
  }

  /**
   * Build Recipe object from database row
   */
  private async buildRecipeFromRow(row: any): Promise<Recipe> {
    const database = db.getDB();

    // Get ingredients
    const ingredientRows = await database.getAllAsync<any>(
      'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY order_index',
      [row.id]
    );

    // Validate that referenced POS ingredients still exist
    const ingredients: Ingredient[] = [];
    for (const ing of ingredientRows) {
      let posIngredientId = ing.pos_ingredient_id;
      let isNew = ing.is_new === 1;
      let confidence = ing.confidence;

      // If there's a posIngredientId reference, verify it still exists
      if (posIngredientId) {
        const posIngExists = await database.getFirstAsync<{ id: string }>(
          'SELECT id FROM pos_ingredients WHERE id = ?',
          [posIngredientId]
        );

        if (!posIngExists) {
          // Referenced ingredient was deleted - clear the reference
          posIngredientId = undefined;
          isNew = true;
          confidence = 'low';
        }
      }

      ingredients.push({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        posIngredientId,
        isNew,
        confidence,
        issues: [],
      });
    }

    // Get issues
    const issueRows = await database.getAllAsync<any>(
      'SELECT * FROM recipe_issues WHERE recipe_id = ?',
      [row.id]
    );

    const issues: RecipeIssue[] = issueRows.map((issue: any) => ({
      type: issue.type,
      message: issue.message,
      ingredientName: issue.ingredient_name,
      suggestedFix: issue.suggested_fix,
      duplicateIndices: issue.duplicate_indices ? JSON.parse(issue.duplicate_indices) : undefined,
    }));

    // Add issues for ingredients with broken references (deleted from inventory)
    for (const ing of ingredients) {
      if (!ing.posIngredientId && ing.name) {
        // Check if there's already an ingredient_not_found issue for this ingredient
        const existingIssue = issues.find(
          i => i.type === 'ingredient_not_found' && i.ingredientName === ing.name
        );
        if (!existingIssue) {
          issues.push({
            type: 'ingredient_not_found',
            message: `"${ing.name}" is not linked to your inventory`,
            ingredientName: ing.name,
            suggestedFix: `Select a matching ingredient from inventory or add "${ing.name}" as new`,
          });
        }
      }
    }

    // Recalculate status and confidence based on current ingredient state
    const unmatchedCount = ingredients.filter(ing => !ing.posIngredientId).length;
    const totalIngredients = ingredients.length;

    let status = row.status;
    let confidence = row.confidence;

    // Update status if ingredients have become unmatched
    if (unmatchedCount > 0 && status === 'ready_to_import') {
      status = 'needs_review';
    }

    // Recalculate confidence
    if (totalIngredients > 0) {
      const matchRate = (totalIngredients - unmatchedCount) / totalIngredients;
      if (matchRate >= 0.9 && unmatchedCount === 0) {
        confidence = 'high';
      } else if (matchRate >= 0.7) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
    }

    return {
      id: row.id,
      name: row.name,
      status,
      confidence,
      lastUpdated: new Date(row.last_updated),
      source: {
        type: row.source_type,
        uri: row.source_uri,
        content: row.source_content,
        uploadedAt: new Date(row.created_at),
      },
      ingredients,
      issues,
      posMenuItemId: row.pos_menu_item_id,
      createdAt: new Date(row.created_at),
    };
  }
}

export const recipeRepository = new RecipeRepository();
