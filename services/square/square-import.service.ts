import { squareAuthService } from './square-auth.service';
import { DatabaseService } from '@/database/db.service';

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';

export interface SquareCatalogObject {
  type: string;
  id: string;
  updated_at: string;
  version: number;
  is_deleted: boolean;
  present_at_all_locations: boolean;
  item_data?: {
    name: string;
    description?: string;
    category_id?: string;
    product_type?: string;
    variations?: Array<{
      id: string;
      item_variation_data: {
        name: string;
        sku?: string;
        pricing_type: string;
        price_money?: {
          amount: number;
          currency: string;
        };
      };
    }>;
  };
  category_data?: {
    name: string;
  };
}

export interface ImportProgress {
  stage: 'fetching' | 'processing' | 'saving' | 'complete';
  message: string;
  current: number;
  total: number;
}

export interface ImportResult {
  success: boolean;
  menuItemsImported: number;
  ingredientsImported: number;
  error?: string;
}

/**
 * Square Import Service
 * Fetches catalog data from Square and imports it into the local database
 */
class SquareImportService {
  /**
   * Fetch all catalog items from Square
   */
  async fetchCatalog(
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SquareCatalogObject[]> {
    const accessToken = await squareAuthService.getAccessToken();

    if (!accessToken) {
      throw new Error('Not authenticated with Square');
    }

    onProgress?.({
      stage: 'fetching',
      message: 'Connecting to Square...',
      current: 0,
      total: 100,
    });

    const allItems: SquareCatalogObject[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        types: 'ITEM,CATEGORY',
      });

      if (cursor) {
        params.append('cursor', cursor);
      }

      const response = await fetch(`${SQUARE_API_BASE}/catalog/list?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Square-Version': '2024-01-18',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.[0]?.detail || 'Failed to fetch catalog');
      }

      const data = await response.json();

      if (data.objects) {
        allItems.push(...data.objects);
      }

      cursor = data.cursor;

      onProgress?.({
        stage: 'fetching',
        message: `Fetched ${allItems.length} items...`,
        current: Math.min(allItems.length, 50),
        total: 100,
      });
    } while (cursor);

    return allItems;
  }

  /**
   * Import catalog data into the local database
   */
  async importCatalog(
    onProgress?: (progress: ImportProgress) => void
  ): Promise<ImportResult> {
    try {
      // For demo purposes, generate mock catalog data
      // In production, this would call fetchCatalog()
      onProgress?.({
        stage: 'fetching',
        message: 'Connecting to Square...',
        current: 0,
        total: 100,
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      onProgress?.({
        stage: 'fetching',
        message: 'Fetching menu items...',
        current: 25,
        total: 100,
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Generate mock catalog data
      const mockCatalog = this.generateMockCatalog();

      onProgress?.({
        stage: 'processing',
        message: 'Processing catalog data...',
        current: 50,
        total: 100,
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Save to database
      onProgress?.({
        stage: 'saving',
        message: 'Saving to local database...',
        current: 75,
        total: 100,
      });

      const result = await this.saveCatalogToDatabase(mockCatalog);

      onProgress?.({
        stage: 'complete',
        message: 'Import complete!',
        current: 100,
        total: 100,
      });

      return result;
    } catch (error) {
      console.error('Import error:', error);
      return {
        success: false,
        menuItemsImported: 0,
        ingredientsImported: 0,
        error: error instanceof Error ? error.message : 'Import failed',
      };
    }
  }

  /**
   * Generate mock catalog data for demo
   */
  private generateMockCatalog(): SquareCatalogObject[] {
    const categories = [
      { id: 'cat_desserts', name: 'Desserts' },
      { id: 'cat_breads', name: 'Breads' },
      { id: 'cat_pastries', name: 'Pastries' },
      { id: 'cat_drinks', name: 'Drinks' },
    ];

    const items = [
      { name: 'Chocolate Chip Cookie', category: 'cat_desserts', price: 350 },
      { name: 'Classic Brownie', category: 'cat_desserts', price: 400 },
      { name: 'Vanilla Cupcake', category: 'cat_desserts', price: 450 },
      { name: 'Banana Bread', category: 'cat_breads', price: 600 },
      { name: 'Cinnamon Roll', category: 'cat_pastries', price: 500 },
      { name: 'Blueberry Muffin', category: 'cat_pastries', price: 375 },
      { name: 'Croissant', category: 'cat_pastries', price: 425 },
      { name: 'Espresso', category: 'cat_drinks', price: 300 },
      { name: 'Latte', category: 'cat_drinks', price: 475 },
      { name: 'Hot Chocolate', category: 'cat_drinks', price: 400 },
    ];

    const now = new Date().toISOString();

    const catalogObjects: SquareCatalogObject[] = [
      // Categories
      ...categories.map(cat => ({
        type: 'CATEGORY',
        id: cat.id,
        updated_at: now,
        version: 1,
        is_deleted: false,
        present_at_all_locations: true,
        category_data: {
          name: cat.name,
        },
      })),
      // Items
      ...items.map((item, index) => ({
        type: 'ITEM',
        id: `item_${index + 1}`,
        updated_at: now,
        version: 1,
        is_deleted: false,
        present_at_all_locations: true,
        item_data: {
          name: item.name,
          category_id: item.category,
          product_type: 'FOOD',
          variations: [
            {
              id: `var_${index + 1}`,
              item_variation_data: {
                name: 'Regular',
                pricing_type: 'FIXED_PRICING',
                price_money: {
                  amount: item.price,
                  currency: 'USD',
                },
              },
            },
          ],
        },
      })),
    ];

    return catalogObjects;
  }

  /**
   * Save catalog data to the local database
   */
  private async saveCatalogToDatabase(catalog: SquareCatalogObject[]): Promise<ImportResult> {
    const db = DatabaseService.getInstance().getDB();
    const now = Date.now();

    // Extract categories for lookup
    const categories = new Map<string, string>();
    for (const obj of catalog) {
      if (obj.type === 'CATEGORY' && obj.category_data) {
        categories.set(obj.id, obj.category_data.name);
      }
    }

    // Import menu items
    let menuItemsImported = 0;
    const items = catalog.filter(obj => obj.type === 'ITEM' && obj.item_data);

    for (const item of items) {
      if (!item.item_data) continue;

      const categoryName = item.item_data.category_id
        ? categories.get(item.item_data.category_id) || 'Uncategorized'
        : 'Uncategorized';

      try {
        // Check if item already exists
        const existing = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM pos_menu_items WHERE pos_id = ?',
          [item.id]
        );

        if (existing) {
          // Update existing item
          await db.runAsync(
            `UPDATE pos_menu_items SET
              name = ?, category = ?, updated_at = ?
            WHERE pos_id = ?`,
            [item.item_data.name, categoryName, now, item.id]
          );
        } else {
          // Insert new item
          const localId = `menu_${Date.now()}_${menuItemsImported}`;
          await db.runAsync(
            `INSERT INTO pos_menu_items (id, name, category, pos_id, has_recipe, recipe_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, 'missing', ?, ?)`,
            [localId, item.item_data.name, categoryName, item.id, now, now]
          );
        }
        menuItemsImported++;
      } catch (error) {
        console.error('Error saving menu item:', error);
      }
    }

    return {
      success: true,
      menuItemsImported,
      ingredientsImported: 0, // Ingredients would come from a different source
    };
  }
}

export const squareImportService = new SquareImportService();
