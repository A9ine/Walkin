/**
 * Example Usage of Recipe Import Service
 * This demonstrates how to use the OCR + Claude pipeline
 */

import { createRecipeImportService } from './recipe-import.service';
import type { POSIngredient } from '../types/pos';

// Example: How to use the recipe import service
export async function exampleRecipeImport() {
  // 1. Configure the service with your API keys
  const importService = createRecipeImportService({
    claudeConfig: {
      apiKey: process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY',
      model: 'claude-3-5-sonnet-20241022',
    },
    ocrConfig: {
      provider: 'google',
      apiKey: process.env.GOOGLE_CLOUD_API_KEY || 'YOUR_API_KEY',
    },
  });

  // 2. Get your POS ingredients (this would come from your database/Square API)
  const posIngredients: POSIngredient[] = [
    {
      id: '1',
      name: 'Milk',
      unit: 'oz',
      aliases: ['Whole Milk', '2% Milk'],
      packSize: 'gallon',
      usedInRecipes: [],
      posId: 'square_123',
      isActive: true,
    },
    {
      id: '2',
      name: 'All-Purpose Flour',
      unit: 'cup',
      aliases: ['AP Flour', 'Flour'],
      usedInRecipes: [],
      posId: 'square_124',
      isActive: true,
    },
    {
      id: '3',
      name: 'Sugar',
      unit: 'cup',
      aliases: ['Granulated Sugar', 'White Sugar'],
      usedInRecipes: [],
      posId: 'square_125',
      isActive: true,
    },
    // ... more ingredients
  ];

  // 3. Import recipe from an image
  try {
    const imageUri = 'file:///path/to/recipe-photo.jpg';

    const result = await importService.importRecipeFromImage(
      imageUri,
      posIngredients,
      (progress) => {
        // Track progress
        console.log(`[${progress.step}] ${progress.message} (${progress.progress}%)`);
      }
    );

    console.log('Recipe imported successfully!');
    console.log('Recipe Name:', result.recipe.name);
    console.log('Confidence:', result.recipe.confidence);
    console.log('Status:', result.recipe.status);
    console.log('Ingredients:', result.recipe.ingredients.length);
    console.log('Issues:', result.recipe.issues.length);

    // Check if recipe is ready to import or needs review
    if (result.recipe.status === 'ready_to_import') {
      console.log('✅ Recipe ready to import to POS!');
    } else if (result.recipe.status === 'needs_review') {
      console.log('⚠️ Recipe needs review before import');
      result.recipe.issues.forEach((issue) => {
        console.log(`  - ${issue.message}`);
      });
    }

    return result;
  } catch (error) {
    console.error('Failed to import recipe:', error);
    throw error;
  }
}

// Example: Import from text
export async function exampleTextImport() {
  const importService = createRecipeImportService({
    claudeConfig: {
      apiKey: process.env.ANTHROPIC_API_KEY || 'YOUR_API_KEY',
    },
    ocrConfig: {
      provider: 'google',
      apiKey: process.env.GOOGLE_CLOUD_API_KEY || 'YOUR_API_KEY',
    },
  });

  const recipeText = `
    Chocolate Chip Cookie

    Ingredients:
    - 2 cups all-purpose flour
    - 1 tsp baking soda
    - 1/2 tsp salt
    - 1 cup butter
    - 3/4 cup sugar
    - 2 eggs
    - 2 tsp vanilla extract
    - 2 cups chocolate chips
  `;

  const posIngredients: POSIngredient[] = [
    // ... your POS ingredients
  ];

  const result = await importService.importRecipeFromText(recipeText, posIngredients);
  return result;
}

// Example: React Native component usage
export function RecipeImportExample() {
  /*
  const handleImportPhoto = async (photoUri: string) => {
    const importService = createRecipeImportService({
      claudeConfig: { apiKey: Constants.manifest?.extra?.claudeApiKey },
      ocrConfig: { provider: 'google', apiKey: Constants.manifest?.extra?.googleApiKey },
    });

    const result = await importService.importRecipeFromImage(
      photoUri,
      posIngredients,
      (progress) => {
        // Update UI with progress
        setImportProgress(progress.progress);
        setImportMessage(progress.message);
      }
    );

    // Save to local database
    await saveRecipe(result.recipe);

    // Navigate to recipe detail screen
    navigation.navigate('RecipeDetail', { recipeId: result.recipe.id });
  };
  */
}
