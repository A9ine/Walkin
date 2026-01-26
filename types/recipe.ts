export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type RecipeStatus = 'ready_to_import' | 'needs_review' | 'import_failed' | 'draft';

export type Unit =
  | 'oz'
  | 'cup'
  | 'tsp'
  | 'tbsp'
  | 'each'
  | 'lb'
  | 'g'
  | 'ml'
  | 'l'
  | 'gallon'
  | 'quart'
  | 'pint';

export interface Ingredient {
  name: string;
  quantity: number;
  unit: Unit | string;
  posIngredientId?: string; // Links to POS master-list ingredient
  isNew?: boolean; // True if ingredient doesn't exist in POS
  aliases?: string[]; // Alternative names for this ingredient
  confidence?: ConfidenceLevel;
  issues?: string[]; // E.g., "Unit unclear", "Similar to Milk (whole)"
}

export interface RecipeVariation {
  id: string;
  name: string; // e.g., "Small", "Medium", "Large"
  ingredients: Ingredient[];
}

export interface Recipe {
  id: string;
  name: string;
  status: RecipeStatus;
  confidence: ConfidenceLevel;
  lastUpdated: Date;
  source: RecipeSource;
  ingredients: Ingredient[];
  variations?: RecipeVariation[];
  issues: RecipeIssue[];
  posMenuItemId?: string; // Links to POS menu item
  createdAt: Date;
}

export interface RecipeSource {
  type: 'photo' | 'pdf' | 'excel' | 'text';
  uri?: string; // For photos/PDFs
  content?: string; // For text
  fileName?: string;
  uploadedAt: Date;
}

export interface RecipeIssue {
  type: 'unit_unclear' | 'ingredient_not_found' | 'similar_ingredient' | 'missing_data' | 'import_failed';
  message: string;
  ingredientName?: string;
  suggestedFix?: string;
}

export interface ParsedRecipeResponse {
  recipe: Recipe;
  rawParsedData: any; // The raw response from Claude
  parseConfidence: ConfidenceLevel;
}

export interface ImportConfirmation {
  creatingNewItems: string[];
  linkingToIngredients: Array<{ name: string; posId: string }>;
  creatingNewIngredients: string[];
}
