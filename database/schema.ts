/**
 * SQLite Database Schema
 * All tables for the Walk-In System
 */

export const SCHEMA = {
  // Recipes table
  RECIPES: `
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ready_to_import', 'needs_review', 'import_failed', 'draft')),
      confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
      source_type TEXT NOT NULL CHECK(source_type IN ('photo', 'pdf', 'excel', 'text')),
      source_uri TEXT,
      source_content TEXT,
      pos_menu_item_id TEXT,
      created_at INTEGER NOT NULL,
      last_updated INTEGER NOT NULL
    );
  `,

  // Ingredients table (for recipes)
  INGREDIENTS: `
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      pos_ingredient_id TEXT,
      is_new INTEGER NOT NULL DEFAULT 1,
      confidence TEXT CHECK(confidence IN ('high', 'medium', 'low')),
      order_index INTEGER NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
  `,

  // Recipe Issues table
  RECIPE_ISSUES: `
    CREATE TABLE IF NOT EXISTS recipe_issues (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('unit_unclear', 'ingredient_not_found', 'similar_ingredient', 'missing_data', 'import_failed')),
      message TEXT NOT NULL,
      ingredient_name TEXT,
      suggested_fix TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
  `,

  // POS Ingredients (master list)
  POS_INGREDIENTS: `
    CREATE TABLE IF NOT EXISTS pos_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      pack_size TEXT,
      pos_id TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,

  // POS Ingredient Aliases
  POS_INGREDIENT_ALIASES: `
    CREATE TABLE IF NOT EXISTS pos_ingredient_aliases (
      id TEXT PRIMARY KEY NOT NULL,
      pos_ingredient_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      FOREIGN KEY (pos_ingredient_id) REFERENCES pos_ingredients(id) ON DELETE CASCADE
    );
  `,

  // POS Menu Items
  POS_MENU_ITEMS: `
    CREATE TABLE IF NOT EXISTS pos_menu_items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      pos_id TEXT NOT NULL UNIQUE,
      has_recipe INTEGER NOT NULL DEFAULT 0,
      recipe_id TEXT,
      recipe_status TEXT CHECK(recipe_status IN ('mapped', 'needs_review', 'missing')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
    );
  `,

  // Sync Logs
  SYNC_LOGS: `
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('menu_sync', 'ingredient_sync', 'recipe_import')),
      status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
      items_processed INTEGER NOT NULL,
      details TEXT,
      error_message TEXT
    );
  `,

  // Indexes for performance
  INDEXES: [
    'CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);',
    'CREATE INDEX IF NOT EXISTS idx_recipes_confidence ON recipes(confidence);',
    'CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients(recipe_id);',
    'CREATE INDEX IF NOT EXISTS idx_recipe_issues_recipe_id ON recipe_issues(recipe_id);',
    'CREATE INDEX IF NOT EXISTS idx_pos_ingredients_active ON pos_ingredients(is_active);',
    'CREATE INDEX IF NOT EXISTS idx_pos_menu_items_recipe_status ON pos_menu_items(recipe_status);',
  ],
};
