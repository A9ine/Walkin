import { DatabaseService } from '@/database/db.service';

/**
 * Utility to sync all recipes to menu items
 * This will create menu items for any recipes that don't have one
 */
export async function syncRecipesToMenu(): Promise<void> {
  console.log('\n🔄 Starting recipe-to-menu sync...');

  try {
    const db = DatabaseService.getInstance().getDB();

    // Get all recipes
    const recipes = await db.getAllAsync<{
      id: string;
      name: string;
    }>('SELECT id, name FROM recipes');

    console.log(`📋 Found ${recipes.length} recipes in database`);

    // Get all menu items
    const menuItems = await db.getAllAsync<{
      id: string;
      recipe_id: string | null;
    }>('SELECT id, recipe_id FROM pos_menu_items');

    console.log(`📋 Found ${menuItems.length} menu items in database`);

    // Get list of recipe IDs that already have menu items
    const linkedRecipeIds = new Set(
      menuItems.filter((m) => m.recipe_id).map((m) => m.recipe_id)
    );

    // Find recipes without menu items
    const unlinkedRecipes = recipes.filter((r) => !linkedRecipeIds.has(r.id));

    console.log(`📝 Found ${unlinkedRecipes.length} recipes without menu items`);

    // Create menu items for unlinked recipes
    let created = 0;
    const now = Date.now();

    for (const recipe of unlinkedRecipes) {
      const menuItemId = `menu_${recipe.id}`;
      const posId = `pos_${recipe.id}`;

      try {
        await db.runAsync(
          `INSERT INTO pos_menu_items (id, name, category, pos_id, has_recipe, recipe_id, recipe_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [menuItemId, recipe.name, 'Uncategorized', posId, 1, recipe.id, 'mapped', now, now]
        );

        console.log(`✅ Created menu item for recipe: ${recipe.name}`);
        created++;
      } catch (err) {
        console.error(`❌ Failed to create menu item for ${recipe.name}:`, err);
      }
    }

    console.log(`\n✅ Sync complete! Created ${created} new menu items.`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    throw error;
  }
}
