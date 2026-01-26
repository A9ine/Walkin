import * as SQLite from 'expo-sqlite';
import { SCHEMA } from './schema';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: SQLite.SQLiteDatabase | null = null;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database and create tables
   */
  async init(): Promise<void> {
    try {
      console.log('Initializing database...');
      this.db = await SQLite.openDatabaseAsync('walkin.db');

      // Create tables
      await this.db.execAsync(SCHEMA.RECIPES);
      await this.db.execAsync(SCHEMA.INGREDIENTS);
      await this.db.execAsync(SCHEMA.RECIPE_ISSUES);
      await this.db.execAsync(SCHEMA.POS_INGREDIENTS);
      await this.db.execAsync(SCHEMA.POS_INGREDIENT_ALIASES);
      await this.db.execAsync(SCHEMA.POS_MENU_ITEMS);
      await this.db.execAsync(SCHEMA.SYNC_LOGS);

      // Create indexes
      for (const index of SCHEMA.INDEXES) {
        await this.db.execAsync(index);
      }

      console.log('Database initialized successfully');

      // Seed initial data if empty
      await this.seedInitialData();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getDB(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Seed initial POS ingredients (for testing)
   */
  private async seedInitialData(): Promise<void> {
    if (!this.db) return;

    try {
      // Check if we already have data
      const result = await this.db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM pos_ingredients'
      );

      if (result && result.count > 0) {
        console.log('Database already seeded');
        return;
      }

      console.log('Seeding initial data...');
      const now = Date.now();

      // Seed POS ingredients
      const ingredients = [
        { id: 'ing_1', name: 'Milk', unit: 'oz', pack_size: 'gallon', pos_id: 'square_ing_1' },
        { id: 'ing_2', name: 'All-Purpose Flour', unit: 'cup', pack_size: '5 lb bag', pos_id: 'square_ing_2' },
        { id: 'ing_3', name: 'Granulated Sugar', unit: 'cup', pack_size: '4 lb bag', pos_id: 'square_ing_3' },
        { id: 'ing_4', name: 'Butter', unit: 'oz', pack_size: '1 lb', pos_id: 'square_ing_4' },
        { id: 'ing_5', name: 'Large Eggs', unit: 'each', pack_size: 'dozen', pos_id: 'square_ing_5' },
        { id: 'ing_6', name: 'Vanilla Extract', unit: 'tsp', pack_size: '4 oz bottle', pos_id: 'square_ing_6' },
        { id: 'ing_7', name: 'Chocolate Chips', unit: 'cup', pack_size: '12 oz bag', pos_id: 'square_ing_7' },
        { id: 'ing_8', name: 'Baking Soda', unit: 'tsp', pack_size: null, pos_id: 'square_ing_8' },
        { id: 'ing_9', name: 'Salt', unit: 'tsp', pack_size: null, pos_id: 'square_ing_9' },
        { id: 'ing_10', name: 'Cocoa Powder', unit: 'cup', pack_size: null, pos_id: 'square_ing_10' },
      ];

      for (const ing of ingredients) {
        await this.db.runAsync(
          'INSERT INTO pos_ingredients (id, name, unit, pack_size, pos_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [ing.id, ing.name, ing.unit, ing.pack_size, ing.pos_id, 1, now, now]
        );
      }

      // Seed aliases
      const aliases = [
        { id: 'alias_1', pos_ingredient_id: 'ing_1', alias: 'Whole Milk' },
        { id: 'alias_2', pos_ingredient_id: 'ing_1', alias: '2% Milk' },
        { id: 'alias_3', pos_ingredient_id: 'ing_2', alias: 'AP Flour' },
        { id: 'alias_4', pos_ingredient_id: 'ing_2', alias: 'Flour' },
        { id: 'alias_5', pos_ingredient_id: 'ing_3', alias: 'Sugar' },
        { id: 'alias_6', pos_ingredient_id: 'ing_3', alias: 'White Sugar' },
        { id: 'alias_7', pos_ingredient_id: 'ing_4', alias: 'Unsalted Butter' },
        { id: 'alias_8', pos_ingredient_id: 'ing_5', alias: 'Eggs' },
        { id: 'alias_9', pos_ingredient_id: 'ing_6', alias: 'Vanilla' },
        { id: 'alias_10', pos_ingredient_id: 'ing_7', alias: 'Semi-Sweet Chocolate Chips' },
        { id: 'alias_11', pos_ingredient_id: 'ing_10', alias: 'Unsweetened Cocoa' },
      ];

      for (const alias of aliases) {
        await this.db.runAsync(
          'INSERT INTO pos_ingredient_aliases (id, pos_ingredient_id, alias) VALUES (?, ?, ?)',
          [alias.id, alias.pos_ingredient_id, alias.alias]
        );
      }

      // Seed POS menu items
      const menuItems = [
        { id: 'menu_1', name: 'Chocolate Chip Cookie', category: 'Desserts', pos_id: 'square_123', has_recipe: 0, recipe_status: 'missing' },
        { id: 'menu_2', name: 'Classic Brownie', category: 'Desserts', pos_id: 'square_124', has_recipe: 0, recipe_status: 'missing' },
        { id: 'menu_3', name: 'Vanilla Cupcake', category: 'Desserts', pos_id: 'square_125', has_recipe: 0, recipe_status: 'missing' },
        { id: 'menu_4', name: 'Banana Bread', category: 'Breads', pos_id: 'square_126', has_recipe: 0, recipe_status: 'missing' },
        { id: 'menu_5', name: 'Cinnamon Roll', category: 'Pastries', pos_id: 'square_127', has_recipe: 0, recipe_status: 'missing' },
      ];

      for (const item of menuItems) {
        await this.db.runAsync(
          'INSERT INTO pos_menu_items (id, name, category, pos_id, has_recipe, recipe_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [item.id, item.name, item.category, item.pos_id, item.has_recipe, item.recipe_status, now, now]
        );
      }

      console.log('Initial data seeded successfully');
    } catch (error) {
      console.error('Failed to seed initial data:', error);
      throw error;
    }
  }

  /**
   * Clear all tables (for testing)
   */
  async clearAll(): Promise<void> {
    if (!this.db) return;

    await this.db.execAsync('DELETE FROM sync_logs');
    await this.db.execAsync('DELETE FROM pos_ingredient_aliases');
    await this.db.execAsync('DELETE FROM recipe_issues');
    await this.db.execAsync('DELETE FROM ingredients');
    await this.db.execAsync('DELETE FROM recipes');
    await this.db.execAsync('DELETE FROM pos_menu_items');
    await this.db.execAsync('DELETE FROM pos_ingredients');

    console.log('All tables cleared');
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      console.log('Database closed');
    }
  }
}

export const db = DatabaseService.getInstance();
