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
        track_inventory?: boolean;
        stockable?: boolean;
      };
    }>;
  };
  category_data?: {
    name: string;
  };
}

export interface SquareInventoryCount {
  catalog_object_id: string;
  catalog_object_type: string;
  state: string;
  location_id: string;
  quantity: string;
  calculated_at: string;
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
    onProgress?: (progress: ImportProgress) => void,
    types: string = 'ITEM,CATEGORY'
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
      const params = new URLSearchParams({ types });

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
   * Fetch inventory counts from Square
   */
  async fetchInventoryCounts(
    locationId?: string,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<SquareInventoryCount[]> {
    const accessToken = await squareAuthService.getAccessToken();

    if (!accessToken) {
      throw new Error('Not authenticated with Square');
    }

    onProgress?.({
      stage: 'fetching',
      message: 'Fetching inventory counts...',
      current: 0,
      total: 100,
    });

    const allCounts: SquareInventoryCount[] = [];
    let cursor: string | undefined;

    do {
      const body: any = {
        states: ['IN_STOCK', 'SOLD', 'RETURNED_BY_CUSTOMER', 'RESERVED_FOR_SALE'],
      };

      if (locationId) {
        body.location_ids = [locationId];
      }

      if (cursor) {
        body.cursor = cursor;
      }

      const response = await fetch(`${SQUARE_API_BASE}/inventory/counts/batch-retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Square-Version': '2024-01-18',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.[0]?.detail || 'Failed to fetch inventory');
      }

      const data = await response.json();

      if (data.counts) {
        allCounts.push(...data.counts);
      }

      cursor = data.cursor;

      onProgress?.({
        stage: 'fetching',
        message: `Fetched ${allCounts.length} inventory counts...`,
        current: Math.min(allCounts.length * 2, 50),
        total: 100,
      });
    } while (cursor);

    return allCounts;
  }

  /**
   * Import catalog data into the local database
   */
  async importCatalog(
    onProgress?: (progress: ImportProgress) => void,
    userId?: string
  ): Promise<ImportResult> {
    if (!userId) {
      return {
        success: false,
        menuItemsImported: 0,
        ingredientsImported: 0,
        error: 'User not authenticated',
      };
    }
    try {
      onProgress?.({
        stage: 'fetching',
        message: 'Connecting to Square...',
        current: 0,
        total: 100,
      });

      // Fetch real catalog data from Square
      const catalog = await this.fetchCatalog((progress) => {
        onProgress?.({
          ...progress,
          current: Math.min(progress.current, 40),
        });
      }, 'ITEM,CATEGORY');

      onProgress?.({
        stage: 'processing',
        message: 'Processing catalog data...',
        current: 50,
        total: 100,
      });

      // Save to database
      onProgress?.({
        stage: 'saving',
        message: 'Saving to local database...',
        current: 75,
        total: 100,
      });

      const result = await this.saveCatalogToDatabase(catalog, userId);

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
   * Import inventory items (stockable items) as POS ingredients
   */
  async importInventory(
    onProgress?: (progress: ImportProgress) => void,
    userId?: string
  ): Promise<ImportResult> {
    if (!userId) {
      return {
        success: false,
        menuItemsImported: 0,
        ingredientsImported: 0,
        error: 'User not authenticated',
      };
    }

    try {
      onProgress?.({
        stage: 'fetching',
        message: 'Connecting to Square...',
        current: 0,
        total: 100,
      });

      // Fetch catalog items that are stockable (inventory items)
      const catalog = await this.fetchCatalog((progress) => {
        onProgress?.({
          ...progress,
          current: Math.min(progress.current, 40),
        });
      }, 'ITEM');

      onProgress?.({
        stage: 'processing',
        message: 'Processing inventory items...',
        current: 50,
        total: 100,
      });

      // Filter for stockable items (inventory items)
      const inventoryItems = catalog.filter((item) => {
        if (item.type !== 'ITEM' || !item.item_data?.variations) return false;
        return item.item_data.variations.some(
          (v) => v.item_variation_data.track_inventory || v.item_variation_data.stockable
        );
      });

      onProgress?.({
        stage: 'saving',
        message: 'Saving inventory to local database...',
        current: 75,
        total: 100,
      });

      const result = await this.saveInventoryToDatabase(inventoryItems, userId);

      onProgress?.({
        stage: 'complete',
        message: 'Inventory import complete!',
        current: 100,
        total: 100,
      });

      return result;
    } catch (error) {
      console.error('Inventory import error:', error);
      return {
        success: false,
        menuItemsImported: 0,
        ingredientsImported: 0,
        error: error instanceof Error ? error.message : 'Inventory import failed',
      };
    }
  }

  /**
   * Save inventory items as POS ingredients to the database
   */
  private async saveInventoryToDatabase(
    inventoryItems: SquareCatalogObject[],
    userId: string
  ): Promise<ImportResult> {
    const db = DatabaseService.getInstance().getDB();
    const now = Date.now();

    let ingredientsImported = 0;

    for (const item of inventoryItems) {
      if (!item.item_data) continue;

      try {
        // Check if ingredient already exists for this user
        const existing = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM pos_ingredients WHERE user_id = ? AND pos_id = ?',
          [userId, item.id]
        );

        if (existing) {
          // Update existing ingredient
          await db.runAsync(
            `UPDATE pos_ingredients SET name = ?, updated_at = ? WHERE user_id = ? AND pos_id = ?`,
            [item.item_data.name, now, userId, item.id]
          );
        } else {
          // Insert new ingredient
          const localId = `ing_${Date.now()}_${ingredientsImported}`;
          await db.runAsync(
            `INSERT INTO pos_ingredients (id, user_id, name, unit, pos_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
            [localId, userId, item.item_data.name, 'each', item.id, now, now]
          );
        }
        ingredientsImported++;
      } catch (error) {
        console.error('Error saving inventory item:', error);
      }
    }

    return {
      success: true,
      menuItemsImported: 0,
      ingredientsImported,
    };
  }

  /**
   * Save catalog data to the local database
   */
  private async saveCatalogToDatabase(catalog: SquareCatalogObject[], userId: string): Promise<ImportResult> {
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
        // Check if item already exists for this user
        const existing = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM pos_menu_items WHERE user_id = ? AND pos_id = ?',
          [userId, item.id]
        );

        if (existing) {
          // Update existing item
          await db.runAsync(
            `UPDATE pos_menu_items SET
              name = ?, category = ?, updated_at = ?
            WHERE user_id = ? AND pos_id = ?`,
            [item.item_data.name, categoryName, now, userId, item.id]
          );
        } else {
          // Insert new item
          const localId = `menu_${Date.now()}_${menuItemsImported}`;
          await db.runAsync(
            `INSERT INTO pos_menu_items (id, user_id, name, category, pos_id, has_recipe, recipe_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, 'missing', ?, ?)`,
            [localId, userId, item.item_data.name, categoryName, item.id, now, now]
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
