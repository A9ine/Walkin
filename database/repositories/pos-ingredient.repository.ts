import type { POSIngredient } from '@/types/pos';
import { db } from '../db.service';

export class POSIngredientRepository {
  /**
   * Get all POS ingredients
   */
  async getAllIngredients(): Promise<POSIngredient[]> {
    const database = db.getDB();

    const rows = await database.getAllAsync<any>(
      'SELECT * FROM pos_ingredients ORDER BY name ASC'
    );

    const ingredients: POSIngredient[] = [];

    for (const row of rows) {
      const ingredient = await this.buildIngredientFromRow(row);
      ingredients.push(ingredient);
    }

    return ingredients;
  }

  /**
   * Get active ingredients only
   */
  async getActiveIngredients(): Promise<POSIngredient[]> {
    const database = db.getDB();

    const rows = await database.getAllAsync<any>(
      'SELECT * FROM pos_ingredients WHERE is_active = 1 ORDER BY name ASC'
    );

    const ingredients: POSIngredient[] = [];

    for (const row of rows) {
      const ingredient = await this.buildIngredientFromRow(row);
      ingredients.push(ingredient);
    }

    return ingredients;
  }

  /**
   * Get ingredient by ID
   */
  async getIngredientById(id: string): Promise<POSIngredient | null> {
    const database = db.getDB();

    const row = await database.getFirstAsync<any>(
      'SELECT * FROM pos_ingredients WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return this.buildIngredientFromRow(row);
  }

  /**
   * Create new ingredient
   */
  async createIngredient(ingredient: Omit<POSIngredient, 'usedInRecipes'>): Promise<void> {
    const database = db.getDB();
    const now = Date.now();

    try {
      await database.runAsync('BEGIN TRANSACTION');

      // Insert ingredient
      await database.runAsync(
        `INSERT INTO pos_ingredients (id, name, unit, pack_size, pos_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ingredient.id,
          ingredient.name,
          ingredient.unit,
          ingredient.packSize || null,
          ingredient.posId,
          ingredient.isActive ? 1 : 0,
          now,
          now,
        ]
      );

      // Insert aliases if any
      if (ingredient.aliases && ingredient.aliases.length > 0) {
        for (let i = 0; i < ingredient.aliases.length; i++) {
          await database.runAsync(
            'INSERT INTO pos_ingredient_aliases (id, pos_ingredient_id, alias) VALUES (?, ?, ?)',
            [`${ingredient.id}_alias_${i}`, ingredient.id, ingredient.aliases[i]]
          );
        }
      }

      await database.runAsync('COMMIT');
    } catch (error) {
      await database.runAsync('ROLLBACK');
      console.error('Failed to create ingredient:', error);
      throw error;
    }
  }

  /**
   * Update ingredient
   */
  async updateIngredient(
    id: string,
    updates: Partial<Omit<POSIngredient, 'id' | 'usedInRecipes'>>
  ): Promise<void> {
    const database = db.getDB();
    const now = Date.now();

    try {
      await database.runAsync('BEGIN TRANSACTION');

      // Build update query dynamically
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.unit !== undefined) {
        fields.push('unit = ?');
        values.push(updates.unit);
      }
      if (updates.packSize !== undefined) {
        fields.push('pack_size = ?');
        values.push(updates.packSize);
      }
      if (updates.isActive !== undefined) {
        fields.push('is_active = ?');
        values.push(updates.isActive ? 1 : 0);
      }

      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);

      await database.runAsync(
        `UPDATE pos_ingredients SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      // Update aliases if provided
      if (updates.aliases !== undefined) {
        // Delete old aliases
        await database.runAsync('DELETE FROM pos_ingredient_aliases WHERE pos_ingredient_id = ?', [
          id,
        ]);

        // Insert new aliases
        if (updates.aliases.length > 0) {
          for (let i = 0; i < updates.aliases.length; i++) {
            await database.runAsync(
              'INSERT INTO pos_ingredient_aliases (id, pos_ingredient_id, alias) VALUES (?, ?, ?)',
              [`${id}_alias_${i}_${now}`, id, updates.aliases[i]]
            );
          }
        }
      }

      await database.runAsync('COMMIT');
    } catch (error) {
      await database.runAsync('ROLLBACK');
      console.error('Failed to update ingredient:', error);
      throw error;
    }
  }

  /**
   * Delete ingredient
   */
  async deleteIngredient(id: string): Promise<void> {
    const database = db.getDB();
    await database.runAsync('DELETE FROM pos_ingredients WHERE id = ?', [id]);
  }

  /**
   * Get recipes using this ingredient
   */
  async getRecipesUsingIngredient(ingredientId: string): Promise<string[]> {
    const database = db.getDB();

    const rows = await database.getAllAsync<{ recipe_id: string }>(
      'SELECT DISTINCT recipe_id FROM ingredients WHERE pos_ingredient_id = ?',
      [ingredientId]
    );

    return rows.map((row) => row.recipe_id);
  }

  /**
   * Build POSIngredient object from database row
   */
  private async buildIngredientFromRow(row: any): Promise<POSIngredient> {
    const database = db.getDB();

    // Get aliases
    const aliasRows = await database.getAllAsync<{ alias: string }>(
      'SELECT alias FROM pos_ingredient_aliases WHERE pos_ingredient_id = ?',
      [row.id]
    );

    const aliases = aliasRows.map((a) => a.alias);

    // Get recipes using this ingredient
    const usedInRecipes = await this.getRecipesUsingIngredient(row.id);

    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      packSize: row.pack_size,
      posId: row.pos_id,
      isActive: row.is_active === 1,
      aliases,
      usedInRecipes,
    };
  }
}

export const posIngredientRepository = new POSIngredientRepository();
