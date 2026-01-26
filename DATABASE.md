# SQLite Database Integration

### **Database Layer**
1. **Schema** - [schema.ts](database/schema.ts)
   - 7 tables: recipes, ingredients, recipe_issues, pos_ingredients, pos_ingredient_aliases, pos_menu_items, sync_logs
   - Proper foreign keys and indexes
   - Type-safe constraints

2. **Database Service** - [db.service.ts](database/db.service.ts)
   - Singleton pattern for global access
   - Auto-initialization on app start
   - Seeded with 10 POS ingredients and 5 menu items
   - Transaction support

3. **Repository Pattern** - [recipe.repository.ts](database/repositories/recipe.repository.ts)
   - `saveRecipe()` - Save recipe with ingredients and issues
   - `getAllRecipes()` - Get all recipes
   - `getRecipesByStatus()` - Filter by status
   - `updateRecipeStatus()` - Update recipe status
   - `deleteRecipe()` - Delete recipe

### **React Hooks**
4. **useDatabase** - [useDatabase.ts](hooks/database/useDatabase.ts)
   - Initializes database on app mount
   - Returns `isReady` and `error` states
   - Used in root layout to ensure DB is ready

5. **useRecipes** - [useRecipes.ts](hooks/database/useRecipes.ts)
   - `recipes` - All recipes from DB
   - `loading` - Loading state
   - `saveRecipe()` - Save new recipe
   - `deleteRecipe()` - Delete recipe
   - `updateRecipeStatus()` - Update status
   - Auto-reloads after mutations

### **Integration Points**
6. **Root Layout** - [app/_layout.tsx](app/_layout.tsx)
   - Shows loading screen while DB initializes
   - Shows error if DB fails

7. **Inbox Screen** - [app/(tabs)/inbox.tsx](app/(tabs)/inbox.tsx)
   - Loads recipes from DB using `useRecipes()`
   - Shows loading/error states
   - Real-time updates when recipes change

8. **Import Screen** - [app/(tabs)/import.tsx](app/(tabs)/import.tsx)
   - Saves captured photos to DB as recipes
   - Creates mock recipe (ready for real OCR + Claude)
   - Navigates to inbox after save

## 📊 **Database Schema**

```sql
recipes
├── id (TEXT PRIMARY KEY)
├── name (TEXT)
├── status (ready_to_import | needs_review | import_failed | draft)
├── confidence (high | medium | low)
├── source_type (photo | pdf | excel | text)
├── source_uri (TEXT)
├── created_at (INTEGER)
└── last_updated (INTEGER)

ingredients
├── id (TEXT PRIMARY KEY)
├── recipe_id (TEXT FK → recipes)
├── name (TEXT)
├── quantity (REAL)
├── unit (TEXT)
├── pos_ingredient_id (TEXT FK → pos_ingredients)
├── is_new (INTEGER)
└── order_index (INTEGER)

recipe_issues
├── id (TEXT PRIMARY KEY)
├── recipe_id (TEXT FK → recipes)
├── type (unit_unclear | ingredient_not_found | similar_ingredient | etc.)
├── message (TEXT)
└── suggested_fix (TEXT)

pos_ingredients (seeded with 10 items)
├── id (TEXT PRIMARY KEY)
├── name (TEXT) - e.g., "All-Purpose Flour"
├── unit (TEXT) - e.g., "cup"
├── pack_size (TEXT) - e.g., "5 lb bag"
├── pos_id (TEXT UNIQUE) - Square ID
└── is_active (INTEGER)

pos_ingredient_aliases (seeded with 11 aliases)
├── id (TEXT PRIMARY KEY)
├── pos_ingredient_id (TEXT FK)
└── alias (TEXT) - e.g., "AP Flour", "Flour"

pos_menu_items (seeded with 5 items)
├── id (TEXT PRIMARY KEY)
├── name (TEXT)
├── category (TEXT)
├── pos_id (TEXT UNIQUE)
├── recipe_id (TEXT FK → recipes)
└── recipe_status (mapped | needs_review | missing)
```

## 🚀 **How It Works**

### **App Startup:**
```
1. App loads → _layout.tsx
2. useDatabase() hook initializes DB
3. Creates tables if not exist
4. Seeds initial POS data (ingredients, menu items)
5. Shows "Initializing database..." spinner
6. Once ready, shows main app
```

### **Taking a Photo:**
```
1. User taps "Take Photo" on Import tab
2. Camera opens, user takes picture
3. processImage() runs:
   - Simulates OCR (30%)
   - Simulates Claude parsing (70%)
   - Creates mock Recipe object (100%)
   - Saves to SQLite via recipeRepository.saveRecipe()
4. Navigates to Inbox
5. Inbox automatically loads new recipe from DB
```

### **Viewing Inbox:**
```
1. Inbox screen mounts
2. useRecipes() hook runs
3. Calls recipeRepository.getAllRecipes()
4. Queries: recipes + ingredients + issues (JOINs)
5. Returns Recipe[] array
6. FlatList renders cards
7. Filters work on loaded data
```

## 🎯 **Current Data Flow**

```
Camera Photo
    ↓
processImage() - Creates mock recipe
    ↓
recipeRepository.saveRecipe()
    ↓
SQLite Database (walkin.db)
    ↓
useRecipes() hook
    ↓
Inbox Screen renders
```

## 🔧 **Next Steps**

To make it **fully functional**, replace the mock data with real OCR + Claude:

1. **In processImage()** (import.tsx:100):
   ```typescript
   // Replace this mock recipe creation
   const mockRecipe: Recipe = { ... }

   // With real OCR + Claude pipeline:
   const ocrText = await ocrService.extractTextFromImage(imageUri);
   const parsed = await claudeParser.parseRecipe(ocrText, posIngredients);
   await recipeRepository.saveRecipe(parsed.recipe);
   ```

2. **Add API keys** to `config/env.ts`
3. **Import the services** we built earlier:
   ```typescript
   import { createRecipeImportService } from '@/services/recipe-import.service';
   ```

## 📝 **Database Commands**

```typescript
// Get all recipes
const recipes = await recipeRepository.getAllRecipes();

// Get by status
const ready = await recipeRepository.getRecipesByStatus('ready_to_import');

// Save new recipe
await recipeRepository.saveRecipe(recipe);

// Update status
await recipeRepository.updateRecipeStatus(id, 'needs_review');

// Delete recipe
await recipeRepository.deleteRecipe(id);

// Clear all data (for testing)
await db.clearAll();
```

## ✨ **Seeded Test Data**

On first launch, the app seeds:

**10 POS Ingredients:**
- Milk (oz) + aliases: Whole Milk, 2% Milk
- All-Purpose Flour (cup) + aliases: AP Flour, Flour
- Granulated Sugar (cup) + aliases: Sugar, White Sugar
- Butter (oz)
- Large Eggs (each)
- Vanilla Extract (tsp)
- Chocolate Chips (cup)
- Baking Soda (tsp)
- Salt (tsp)
- Cocoa Powder (cup)

**5 POS Menu Items:**
- Chocolate Chip Cookie (Desserts)
- Classic Brownie (Desserts)
- Vanilla Cupcake (Desserts)
- Banana Bread (Breads)
- Cinnamon Roll (Pastries)

## 🧪 **Testing**

1. **Take a photo** - Creates "Chocolate Chip Cookie" recipe in DB
2. **View Inbox** - Shows recipe loaded from SQLite
3. **Close app & reopen** - Data persists!
4. **Take another photo** - Adds another recipe
5. **Filter by status** - Filters work on DB data

The database file is stored at: `SQLite.openDatabaseAsync('walkin.db')`
