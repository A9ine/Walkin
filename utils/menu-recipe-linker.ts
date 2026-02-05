import { DatabaseService } from '@/database/db.service';
import type { Recipe } from '@/types/recipe';

/**
 * Automatically link a recipe to a menu item based on name similarity
 * If no matching menu item exists, create a new one
 */
export async function linkRecipeToMenuItem(recipe: Recipe, userId: string): Promise<void> {
  console.log(`\n🔗 linkRecipeToMenuItem called for recipe: "${recipe.name}" (ID: ${recipe.id})`);

  try {
    const db = DatabaseService.getInstance().getDB();

    // Get all menu items
    const menuItems = await db.getAllAsync<{
      id: string;
      name: string;
      recipe_id: string | null;
    }>('SELECT id, name, recipe_id FROM pos_menu_items');

    console.log(`📋 Found ${menuItems.length} existing menu items`);

    // Find best matching menu item (case-insensitive, fuzzy match)
    let bestMatch: { id: string; similarity: number } | null = null;

    for (const menuItem of menuItems) {
      // Skip if already has a recipe linked
      if (menuItem.recipe_id) continue;

      const similarity = calculateNameSimilarity(recipe.name, menuItem.name);

      if (similarity > 0.7 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { id: menuItem.id, similarity };
      }
    }

    // If we found a good match, link them
    if (bestMatch) {
      await db.runAsync(
        `UPDATE pos_menu_items
         SET recipe_id = ?, recipe_status = ?
         WHERE id = ?`,
        [recipe.id, 'mapped', bestMatch.id]
      );

      console.log(`✅ Linked recipe "${recipe.name}" to existing menu item (${Math.round(bestMatch.similarity * 100)}% match)`);
    } else {
      // No matching menu item found - create a new one
      console.log(`📝 No matching menu item found. Creating new menu item...`);

      const now = Date.now();
      const menuItemId = `menu_${recipe.id}`;
      const posId = `pos_${recipe.id}`;

      try {
        await db.runAsync(
          `INSERT INTO pos_menu_items (id, user_id, name, category, pos_id, has_recipe, recipe_id, recipe_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [menuItemId, userId, recipe.name, 'Uncategorized', posId, 1, recipe.id, 'mapped', now, now]
        );

        console.log(`✅ Created new menu item for recipe "${recipe.name}" with ID ${menuItemId}`);

        // Verify it was created
        const verify = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM pos_menu_items WHERE id = ?',
          [menuItemId]
        );
        console.log(`✓ Verification: Menu item exists in DB: ${verify?.count === 1}`);
      } catch (insertError) {
        console.error(`❌ Failed to create menu item for recipe "${recipe.name}":`, insertError);
        throw insertError;
      }
    }
  } catch (error) {
    console.error('❌ Failed to link recipe to menu item:', error);
    // Re-throw so the error isn't silently swallowed
    throw error;
  }
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateNameSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Exact match
  if (s1 === s2) return 1.0;

  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9;
  }

  // Word-based matching
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);

  let matchCount = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / Math.max(words1.length, words2.length);
}
