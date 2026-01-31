import type { Recipe, Ingredient } from '@/types/recipe';
import type { POSIngredient } from '@/types/pos';

const SQUARE_ACCESS_TOKEN = process.env.EXPO_PUBLIC_SQUARE_ACCESS_TOKEN || '';
const SQUARE_API_BASE = 'https://connect.squareup.com/v2';

export interface ExportResult {
  success: boolean;
  catalogObjectId?: string;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  errors: string[];
}

export interface SquareCatalogItem {
  type: 'ITEM';
  id?: string;
  item_data: {
    name: string;
    product_type: 'FOOD' | 'REGULAR';
    description?: string;
    variations?: Array<{
      type: 'ITEM_VARIATION';
      item_variation_data: {
        name: string;
        pricing_type: 'FIXED_PRICING' | 'VARIABLE_PRICING';
        price_money?: {
          amount: number;
          currency: string;
        };
        track_inventory?: boolean;
        stockable?: boolean;
      };
    }>;
    modifier_list_info?: Array<{
      modifier_list_id: string;
      modifier_overrides?: Array<{
        modifier_id: string;
        on_by_default?: boolean;
      }>;
    }>;
  };
}

export interface SquareModifierList {
  type: 'MODIFIER_LIST';
  id?: string;
  modifier_list_data: {
    name: string;
    selection_type: 'SINGLE' | 'MULTIPLE';
    modifiers?: Array<{
      type: 'MODIFIER';
      modifier_data: {
        name: string;
        price_money?: {
          amount: number;
          currency: string;
        };
      };
    }>;
  };
}

/**
 * Square Export Service
 * Handles exporting recipes to Square Catalog with inventory tracking
 */
export class SquareExportService {
  private accessToken: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || SQUARE_ACCESS_TOKEN;
  }

  /**
   * Check if Square API is configured
   */
  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  /**
   * Sync POS ingredients to Square as trackable inventory items
   */
  async syncIngredientsToSquare(ingredients: POSIngredient[]): Promise<SyncResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        syncedCount: 0,
        errors: ['Square access token not configured'],
      };
    }

    const errors: string[] = [];
    let syncedCount = 0;

    for (const ingredient of ingredients) {
      try {
        const catalogObject: SquareCatalogItem = {
          type: 'ITEM',
          id: `#ingredient_${ingredient.id}`,
          item_data: {
            name: ingredient.name,
            product_type: 'REGULAR',
            description: `Inventory ingredient: ${ingredient.name}`,
            variations: [
              {
                type: 'ITEM_VARIATION',
                item_variation_data: {
                  name: 'Regular',
                  pricing_type: 'VARIABLE_PRICING',
                  track_inventory: true,
                  stockable: true,
                },
              },
            ],
          },
        };

        const response = await fetch(`${SQUARE_API_BASE}/catalog/object`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
            'Square-Version': '2024-01-18',
          },
          body: JSON.stringify({
            idempotency_key: `sync_${ingredient.id}_${Date.now()}`,
            object: catalogObject,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.errors?.[0]?.detail || 'Unknown error');
        }

        syncedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${ingredient.name}: ${errorMessage}`);
      }
    }

    return {
      success: errors.length === 0,
      syncedCount,
      errors,
    };
  }

  /**
   * Export a recipe as a menu item with component ingredients
   * Note: Full automatic inventory deduction requires Square for Restaurants
   */
  async exportRecipe(recipe: Recipe): Promise<ExportResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Square access token not configured',
      };
    }

    // Validate all ingredients are matched
    const unmatchedIngredients = recipe.ingredients.filter((ing) => !ing.posIngredientId);
    if (unmatchedIngredients.length > 0) {
      return {
        success: false,
        error: `Cannot export: ${unmatchedIngredients.length} unmatched ingredient(s). Please match all ingredients first.`,
      };
    }

    try {
      // Create the menu item in Square
      const catalogObject: SquareCatalogItem = {
        type: 'ITEM',
        id: `#recipe_${recipe.id}`,
        item_data: {
          name: recipe.name,
          product_type: 'FOOD',
          description: `Recipe with ${recipe.ingredients.length} ingredients`,
          variations: [
            {
              type: 'ITEM_VARIATION',
              item_variation_data: {
                name: 'Regular',
                pricing_type: 'VARIABLE_PRICING',
              },
            },
          ],
        },
      };

      const response = await fetch(`${SQUARE_API_BASE}/catalog/object`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          'Square-Version': '2024-01-18',
        },
        body: JSON.stringify({
          idempotency_key: `recipe_${recipe.id}_${Date.now()}`,
          object: catalogObject,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.[0]?.detail || 'Failed to create catalog item');
      }

      const data = await response.json();

      return {
        success: true,
        catalogObjectId: data.catalog_object?.id,
      };
    } catch (error) {
      console.error('Square export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export to Square',
      };
    }
  }

  /**
   * Generate CSV for manual Square import (fallback option)
   * This creates a CSV file that can be imported into Square Dashboard
   */
  generateCSV(recipes: Recipe[]): string {
    const headers = [
      'Item Name',
      'Description',
      'Category',
      'SKU',
      'Variation Name',
      'Price',
      'Enabled',
    ];

    const rows: string[][] = [headers];

    for (const recipe of recipes) {
      // Main recipe row
      rows.push([
        this.escapeCSV(recipe.name),
        this.escapeCSV(this.generateDescription(recipe)),
        'Menu Items',
        `RECIPE_${recipe.id}`,
        'Regular',
        '', // Price left blank for user to fill
        'Y',
      ]);
    }

    return rows.map((row) => row.join(',')).join('\n');
  }

  /**
   * Generate detailed CSV including ingredient breakdown
   */
  generateDetailedCSV(recipes: Recipe[]): string {
    const headers = [
      'Recipe Name',
      'Ingredient Name',
      'Quantity',
      'Unit',
      'POS Ingredient ID',
      'Matched',
      'Confidence',
    ];

    const rows: string[][] = [headers];

    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        rows.push([
          this.escapeCSV(recipe.name),
          this.escapeCSV(ingredient.name),
          ingredient.quantity.toString(),
          ingredient.unit,
          ingredient.posIngredientId || '',
          ingredient.posIngredientId ? 'Yes' : 'No',
          ingredient.confidence || 'N/A',
        ]);
      }
    }

    return rows.map((row) => row.join(',')).join('\n');
  }

  /**
   * Generate recipe description from ingredients
   */
  private generateDescription(recipe: Recipe): string {
    const ingredientNames = recipe.ingredients.map((ing) => ing.name).slice(0, 5);
    const suffix = recipe.ingredients.length > 5 ? ` and ${recipe.ingredients.length - 5} more` : '';
    return `Contains: ${ingredientNames.join(', ')}${suffix}`;
  }

  /**
   * Escape CSV field
   */
  private escapeCSV(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}

// Export singleton instance
export const squareExportService = new SquareExportService();
