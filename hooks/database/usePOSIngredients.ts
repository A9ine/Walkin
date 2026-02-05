import { useState, useEffect, useCallback } from 'react';
import type { POSIngredient } from '@/types/pos';
import { posIngredientRepository } from '@/database/repositories/pos-ingredient.repository';
import { useAuth } from '@/contexts/AuthContext';

export function usePOSIngredients() {
  const { user } = useAuth();
  const [ingredients, setIngredients] = useState<POSIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadIngredients = useCallback(async () => {
    if (!user?.uid) {
      setIngredients([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const allIngredients = await posIngredientRepository.getAllIngredients(user.uid);
      setIngredients(allIngredients);
      setError(null);
    } catch (err) {
      console.error('Failed to load ingredients:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  const createIngredient = useCallback(
    async (ingredient: Omit<POSIngredient, 'usedInRecipes'>) => {
      if (!user?.uid) throw new Error('User not authenticated');
      try {
        await posIngredientRepository.createIngredient(ingredient, user.uid);
        await loadIngredients();
      } catch (err) {
        console.error('Failed to create ingredient:', err);
        throw err;
      }
    },
    [loadIngredients, user?.uid]
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
