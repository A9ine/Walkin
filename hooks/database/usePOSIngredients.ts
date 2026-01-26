import { useState, useEffect, useCallback } from 'react';
import type { POSIngredient } from '@/types/pos';
import { posIngredientRepository } from '@/database/repositories/pos-ingredient.repository';

export function usePOSIngredients() {
  const [ingredients, setIngredients] = useState<POSIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadIngredients = useCallback(async () => {
    try {
      setLoading(true);
      const allIngredients = await posIngredientRepository.getAllIngredients();
      setIngredients(allIngredients);
      setError(null);
    } catch (err) {
      console.error('Failed to load ingredients:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  const createIngredient = useCallback(
    async (ingredient: Omit<POSIngredient, 'usedInRecipes'>) => {
      try {
        await posIngredientRepository.createIngredient(ingredient);
        await loadIngredients();
      } catch (err) {
        console.error('Failed to create ingredient:', err);
        throw err;
      }
    },
    [loadIngredients]
  );

  const updateIngredient = useCallback(
    async (id: string, updates: Partial<Omit<POSIngredient, 'id' | 'usedInRecipes'>>) => {
      try {
        await posIngredientRepository.updateIngredient(id, updates);
        await loadIngredients();
      } catch (err) {
        console.error('Failed to update ingredient:', err);
        throw err;
      }
    },
    [loadIngredients]
  );

  const deleteIngredient = useCallback(
    async (id: string) => {
      try {
        await posIngredientRepository.deleteIngredient(id);
        await loadIngredients();
      } catch (err) {
        console.error('Failed to delete ingredient:', err);
        throw err;
      }
    },
    [loadIngredients]
  );

  return {
    ingredients,
    loading,
    error,
    loadIngredients,
    createIngredient,
    updateIngredient,
    deleteIngredient,
  };
}
