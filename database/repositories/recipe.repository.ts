import type { Recipe, Ingredient, RecipeIssue } from '@/types/recipe';
import { db } from '../db.service';
import { linkRecipeToMenuItem } from '@/utils/menu-recipe-linker';

export class RecipeRepository {
  /**
   * Save a new recipe to database
   */
  async saveRecipe(recipe: Recipe): Promise<void> {
    const database = db.getDB();

    try {
      await database.runAsync('BEGIN TRANSACTION');

      // Insert recipe
      await database.runAsync(
        `INSERT INTO recipes (id, name, status, confidence, source_type, source_uri, source_content, pos_menu_item_id, created_at, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipe.id,
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
          `INSERT INTO recipe_issues (id, recipe_id, type, message, ingredient_name, suggested_fix)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            `${recipe.id}_issue_${i}`,
            recipe.id,
            issue.type,
            issue.message,
            issue.ingredientName || null,
            issue.suggestedFix || null,
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
   * Get all recipes
   */
  async getAllRecipes(): Promise<Recipe[]> {
    const database = db.getDB();

    const recipeRows = await database.getAllAsync<any>(
      'SELECT * FROM recipes ORDER BY last_updated DESC'
    );

    const recipes: Recipe[] = [];

    for (const row of recipeRows) {
      const recipe = await this.buildRecipeFromRow(row);
      recipes.push(recipe);
    }

    return recipes;
  }

  /**
   * Get recipes by status
   */
  async getRecipesByStatus(status: Recipe['status']): Promise<Recipe[]> {
    const database = db.getDB();

    const recipeRows = await database.getAllAsync<any>(
      'SELECT * FROM recipes WHERE status = ? ORDER BY last_updated DESC',
      [status]
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

    const ingredients: Ingredient[] = ingredientRows.map((ing: any) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      posIngredientId: ing.pos_ingredient_id,
      isNew: ing.is_new === 1,
      confidence: ing.confidence,
      issues: [],
    }));

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
    }));

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      confidence: row.confidence,
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
