/**
 * SQLite Database Schema
 * All tables for the Walk-In System
 */

export const SCHEMA = {
  // User profile cache (for offline access)
  USER_PROFILES: `
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      firebase_uid TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,

  // POS connections linked to users
  USER_POS_CONNECTIONS: `
    CREATE TABLE IF NOT EXISTS user_pos_connections (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      location_id TEXT NOT NULL,
      location_name TEXT NOT NULL,
      access_token_ref TEXT,
      refresh_token_ref TEXT,
      is_active INTEGER DEFAULT 1,
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user_profiles(firebase_uid)
    );
  `,

  // Recipes table
  RECIPES: `
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ready_to_import', 'needs_review', 'import_failed', 'draft')),
      confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
      source_type TEXT NOT NULL CHECK(source_type IN ('photo', 'pdf', 'excel', 'text')),
      source_uri TEXT,
      source_content TEXT,
      pos_menu_item_id TEXT,
      created_at INTEGER NOT NULL,
      last_updated INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES user_profiles(firebase_uid)
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
      type TEXT NOT NULL CHECK(type IN ('unit_unclear', 'ingredient_not_found', 'similar_ingredient', 'missing_data', 'import_failed', 'duplicate_ingredient')),
      message TEXT NOT NULL,
      ingredient_name TEXT,
      suggested_fix TEXT,
      duplicate_indices TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
  `,

  // POS Ingredients (master list)
  POS_INGREDIENTS: `
    CREATE TABLE IF NOT EXISTS pos_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      pack_size TEXT,
      pos_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, pos_id),
      FOREIGN KEY (user_id) REFERENCES user_profiles(firebase_uid)
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

  // POS Ingredient Supported Units
  POS_INGREDIENT_UNITS: `
    CREATE TABLE IF NOT EXISTS pos_ingredient_units (
      id TEXT PRIMARY KEY NOT NULL,
      pos_ingredient_id TEXT NOT NULL,
      unit TEXT NOT NULL,
      conversion_factor REAL NOT NULL DEFAULT 1,
      is_base_unit INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (pos_ingredient_id) REFERENCES pos_ingredients(id) ON DELETE CASCADE
    );
  `,

  // POS Menu Items
  POS_MENU_ITEMS: `
    CREATE TABLE IF NOT EXISTS pos_menu_items (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      pos_id TEXT NOT NULL,
      has_recipe INTEGER NOT NULL DEFAULT 0,
      recipe_id TEXT,
      recipe_status TEXT CHECK(recipe_status IN ('mapped', 'needs_review', 'missing')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, pos_id),
      FOREIGN KEY (user_id) REFERENCES user_profiles(firebase_uid),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
    );
  `,

  // Sync Logs
  SYNC_LOGS: `
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('menu_sync', 'ingredient_sync', 'recipe_import')),
      status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'partial')),
      items_processed INTEGER NOT NULL,
      details TEXT,
      error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES user_profiles(firebase_uid)
    );
  `,

  // Indexes for performance
  INDEXES: [
    'CREATE INDEX IF NOT EXISTS idx_user_profiles_firebase_uid ON user_profiles(firebase_uid);',
    'CREATE INDEX IF NOT EXISTS idx_user_pos_connections_user_id ON user_pos_connections(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);',
    'CREATE INDEX IF NOT EXISTS idx_recipes_confidence ON recipes(confidence);',
    'CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients(recipe_id);',
    'CREATE INDEX IF NOT EXISTS idx_recipe_issues_recipe_id ON recipe_issues(recipe_id);',
    'CREATE INDEX IF NOT EXISTS idx_pos_ingredients_user_id ON pos_ingredients(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_pos_ingredients_active ON pos_ingredients(is_active);',
    'CREATE INDEX IF NOT EXISTS idx_pos_menu_items_user_id ON pos_menu_items(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_pos_menu_items_recipe_status ON pos_menu_items(recipe_status);',
    'CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id);',
  ],
};
