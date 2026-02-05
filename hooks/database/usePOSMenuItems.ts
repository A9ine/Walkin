import { useState, useEffect, useCallback } from 'react';
import type { POSMenuItem } from '@/types/pos';
import { DatabaseService } from '@/database/db.service';
import { useAuth } from '@/contexts/AuthContext';

export function usePOSMenuItems() {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<POSMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadMenuItems = useCallback(async () => {
    if (!user?.uid) {
      setMenuItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const db = DatabaseService.getInstance().getDB();

      const rows = await db.getAllAsync<{
        id: string;
        name: string;
        category: string;
        pos_id: string;
        recipe_id: string | null;
        recipe_status: 'mapped' | 'needs_review' | 'missing';
      }>(
        'SELECT * FROM pos_menu_items WHERE user_id = ? ORDER BY name ASC',
        [user.uid]
      );

      console.log(`📋 Loaded ${rows.length} menu items from database`);
      rows.forEach((row) => {
        console.log(`  - ${row.name} (${row.category}) - Recipe: ${row.recipe_id ? '✅' : '❌'} Status: ${row.recipe_status}`);
      });

      const items: POSMenuItem[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        posId: row.pos_id,
        hasRecipe: row.recipe_id !== null,
        recipeId: row.recipe_id || undefined,
        recipeStatus: row.recipe_status,
      }));

      setMenuItems(items);
      setError(null);
    } catch (err) {
      console.error('Failed to load menu items:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadMenuItems();
  }, [loadMenuItems]);

  const updateMenuItemRecipe = useCallback(
    async (menuItemId: string, recipeId: string | null) => {
      try {
        const db = DatabaseService.getInstance().getDB();

        const recipeStatus = recipeId ? 'mapped' : 'missing';

        await db.runAsync(
          `UPDATE pos_menu_items
           SET recipe_id = ?, recipe_status = ?
           WHERE id = ?`,
          [recipeId, recipeStatus, menuItemId]
        );

        await loadMenuItems();
      } catch (err) {
        console.error('Failed to update menu item recipe:', err);
        throw err;
      }
    },
    [loadMenuItems]
  );

  const updateMenuItemStatus = useCallback(
    async (menuItemId: string, status: 'mapped' | 'needs_review' | 'missing') => {
      try {
        const db = DatabaseService.getInstance().getDB();

        await db.runAsync(
          `UPDATE pos_menu_items SET recipe_status = ? WHERE id = ?`,
          [status, menuItemId]
        );

        await loadMenuItems();
      } catch (err) {
        console.error('Failed to update menu item status:', err);
        throw err;
      }
    },
    [loadMenuItems]
  );

  return {
    menuItems,
    loading,
    error,
    loadMenuItems,
    updateMenuItemRecipe,
    updateMenuItemStatus,
  };
}
