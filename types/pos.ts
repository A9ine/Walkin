export type POSProvider = 'square' | 'clover' | 'toast' | 'snackpass' | 'godaddy';

export interface UnitOption {
  unit: string;
  conversionFactor: number; // Relative to base unit (base unit = 1)
  isBaseUnit?: boolean;
}

export interface POSIngredient {
  id: string;
  name: string;
  unit: string; // Primary/base unit
  supportedUnits?: UnitOption[]; // All units this ingredient can be measured in
  aliases?: string[];
  packSize?: string; // e.g., "gallon", "5 lb bag"
  usedInRecipes: string[]; // Array of recipe IDs
  posId: string; // ID in the POS system
  isActive: boolean;
}

export interface POSMenuItem {
  id: string;
  name: string;
  category?: string;
  posId: string;
  hasRecipe: boolean;
  recipeId?: string;
  recipeStatus?: 'mapped' | 'needs_review' | 'missing';
}

export interface POSConnection {
  provider: POSProvider;
  locationId: string;
  locationName: string;
  isConnected: boolean;
  lastSyncedAt?: Date;
  accessToken?: string;
  refreshToken?: string;
}

export interface SyncLog {
  id: string;
  timestamp: Date;
  type: 'menu_sync' | 'ingredient_sync' | 'recipe_import';
  status: 'success' | 'failed' | 'partial';
  itemsProcessed: number;
  errors?: string[];
  details?: string;
}
