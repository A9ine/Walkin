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

      // Check if we need to reset schema BEFORE creating tables
      await this.checkAndResetSchema();

      // Create tables
      await this.db.execAsync(SCHEMA.USER_PROFILES);
      await this.db.execAsync(SCHEMA.USER_POS_CONNECTIONS);
      await this.db.execAsync(SCHEMA.RECIPES);
      await this.db.execAsync(SCHEMA.INGREDIENTS);
      await this.db.execAsync(SCHEMA.RECIPE_ISSUES);
      await this.db.execAsync(SCHEMA.POS_INGREDIENTS);
      await this.db.execAsync(SCHEMA.POS_INGREDIENT_ALIASES);
      await this.db.execAsync(SCHEMA.POS_INGREDIENT_UNITS);
      await this.db.execAsync(SCHEMA.POS_MENU_ITEMS);
      await this.db.execAsync(SCHEMA.SYNC_LOGS);

      // Create indexes
      for (const index of SCHEMA.INDEXES) {
        await this.db.execAsync(index);
      }

      // Run other migrations
      await this.runMigrations();

      console.log('Database initialized successfully');

      // Seed initial data if empty
      await this.seedInitialData();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Check if old schema exists and reset if needed
   */
  private async checkAndResetSchema(): Promise<void> {
    if (!this.db) return;

    try {
      // Check if recipes table exists
      const tables = await this.db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'"
      );

      if (tables.length === 0) {
        // No existing tables, fresh install
        return;
      }

      // Check if recipes table has user_id column
      const recipesTableInfo = await this.db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(recipes)"
      );
      const hasUserIdInRecipes = recipesTableInfo.some(col => col.name === 'user_id');

      if (!hasUserIdInRecipes) {
        console.log('Old schema detected. Dropping all tables...');

        // Drop all tables
        await this.db.execAsync('DROP TABLE IF EXISTS sync_logs');
        await this.db.execAsync('DROP TABLE IF EXISTS pos_ingredient_units');
        await this.db.execAsync('DROP TABLE IF EXISTS pos_ingredient_aliases');
        await this.db.execAsync('DROP TABLE IF EXISTS pos_menu_items');
        await this.db.execAsync('DROP TABLE IF EXISTS pos_ingredients');
        await this.db.execAsync('DROP TABLE IF EXISTS recipe_issues');
        await this.db.execAsync('DROP TABLE IF EXISTS ingredients');
        await this.db.execAsync('DROP TABLE IF EXISTS recipes');
        await this.db.execAsync('DROP TABLE IF EXISTS user_pos_connections');
        await this.db.execAsync('DROP TABLE IF EXISTS user_profiles');

        console.log('Old tables dropped. Will recreate with new schema.');
      }
    } catch (error) {
      console.error('Schema check error:', error);
      // If check fails, try to continue anyway
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
   * Run database migrations for schema updates
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) return;

    try {
      // Migration: Add duplicate_indices column to recipe_issues if it doesn't exist
      const tableInfo = await this.db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(recipe_issues)"
      );
      const hasColumn = tableInfo.some(col => col.name === 'duplicate_indices');

      if (!hasColumn) {
        console.log('Running migration: Adding duplicate_indices column...');
        await this.db.execAsync(
          'ALTER TABLE recipe_issues ADD COLUMN duplicate_indices TEXT'
        );
        console.log('Migration complete: duplicate_indices column added');
      }
    } catch (error) {
      console.error('Migration error:', error);
      // Don't throw - migrations are best-effort
    }
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

      // No default seed data - inventory starts empty
      console.log('Database initialized with empty inventory');
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
    await this.db.execAsync('DELETE FROM pos_ingredient_units');
    await this.db.execAsync('DELETE FROM recipe_issues');
    await this.db.execAsync('DELETE FROM ingredients');
    await this.db.execAsync('DELETE FROM recipes');
    await this.db.execAsync('DELETE FROM pos_menu_items');
    await this.db.execAsync('DELETE FROM pos_ingredients');
    await this.db.execAsync('DELETE FROM user_pos_connections');
    await this.db.execAsync('DELETE FROM user_profiles');

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
