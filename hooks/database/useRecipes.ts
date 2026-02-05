import { useState, useEffect, useCallback } from 'react';
import type { Recipe } from '@/types/recipe';
import { recipeRepository } from '@/database/repositories/recipe.repository';
import { useAuth } from '@/contexts/AuthContext';

export function useRecipes() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadRecipes = useCallback(async () => {
    if (!user?.uid) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const allRecipes = await recipeRepository.getAllRecipes(user.uid);
      setRecipes(allRecipes);
      setError(null);
    } catch (err) {
      console.error('Failed to load recipes:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const saveRecipe = useCallback(async (recipe: Recipe) => {
    if (!user?.uid) throw new Error('User not authenticated');
    try {
      await recipeRepository.saveRecipe(recipe, user.uid);
      await loadRecipes(); // Reload after save
    } catch (err) {
      console.error('Failed to save recipe:', err);
      throw err;
    }
  }, [loadRecipes, user?.uid]);

  const deleteRecipe = useCallback(async (id: string) => {
    try {
      await recipeRepository.deleteRecipe(id);
      await loadRecipes(); // Reload after delete
    } catch (err) {
      console.error('Failed to delete recipe:', err);
      throw err;
    }
  }, [loadRecipes]);

  const updateRecipeStatus = useCallback(async (id: string, status: Recipe['status']) => {
    try {
      await recipeRepository.updateRecipeStatus(id, status);
      await loadRecipes(); // Reload after update
    } catch (err) {
      console.error('Failed to update recipe status:', err);
      throw err;
    }
  }, [loadRecipes]);

  return {
    recipes,
    loading,
    error,
    loadRecipes,
    saveRecipe,
    deleteRecipe,
    updateRecipeStatus,
  };
}
