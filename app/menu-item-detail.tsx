import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { DatabaseService } from '@/database/db.service';
import { recipeRepository } from '@/database/repositories/recipe.repository';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import type { Recipe } from '@/types/recipe';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface EditableIngredient {
  name: string;
  quantity: number;
  unit: string;
  posIngredientId?: string;
  isNew?: boolean;
  showDropdown?: boolean;
  filteredSuggestions?: Array<{ id: string; name: string; unit: string }>;
}

export default function MenuItemDetailScreen() {
  const { menuItemId } = useLocalSearchParams<{ menuItemId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { ingredients: posIngredients } = usePOSIngredients();

  const [loading, setLoading] = useState(true);
  const [recipeName, setRecipeName] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([]);
  const [menuItemName, setMenuItemName] = useState('');

  useEffect(() => {
    loadMenuItemAndRecipe();
  }, [menuItemId]);

  const loadMenuItemAndRecipe = async () => {
    try {
      setLoading(true);
      const db = DatabaseService.getInstance().getDB();

      // Get menu item details
      const menuItem = await db.getFirstAsync<{
        id: string;
        name: string;
        recipe_id: string | null;
      }>('SELECT id, name, recipe_id FROM pos_menu_items WHERE id = ?', [menuItemId]);

      if (!menuItem) {
        Alert.alert('Error', 'Menu item not found');
        router.back();
        return;
      }

      setMenuItemName(menuItem.name);

      // If there's a linked recipe, load it
      if (menuItem.recipe_id) {
        const recipeData = await recipeRepository.getRecipeById(menuItem.recipe_id);
        if (recipeData) {
          setRecipe(recipeData);
          setRecipeName(recipeData.name);
          setIngredients(
            recipeData.ingredients.map((ing) => ({
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              posIngredientId: ing.posIngredientId,
              isNew: ing.isNew,
              showDropdown: false,
            }))
          );
        }
      } else {
        // No recipe linked - initialize empty
        setRecipeName(menuItem.name);
        setIngredients([]);
      }
    } catch (err) {
      console.error('Failed to load menu item:', err);
      Alert.alert('Error', 'Failed to load menu item');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRecipe = async () => {
    if (!recipeName.trim()) {
      Alert.alert('Error', 'Recipe name is required');
      return;
    }

    if (ingredients.length === 0) {
      Alert.alert('Error', 'At least one ingredient is required');
      return;
    }

    const unmatchedIngredients = ingredients.filter((ing) => !ing.posIngredientId);
    if (unmatchedIngredients.length > 0) {
      Alert.alert(
        'Unmatched Ingredients',
        `${unmatchedIngredients.length} ingredient(s) are not linked to your inventory.`
      );
      return;
    }

    try {
      const updatedRecipe: Recipe = {
        id: recipe?.id || `recipe_${Date.now()}`,
        name: recipeName.trim(),
        status: 'ready_to_import',
        confidence: 'high',
        lastUpdated: new Date(),
        createdAt: recipe?.createdAt || new Date(),
        source: recipe?.source || {
          type: 'text',
          content: `Manual entry: ${recipeName}`,
          uploadedAt: new Date(),
        },
        ingredients: ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          posIngredientId: ing.posIngredientId,
          isNew: ing.isNew || false,
        })),
        issues: [],
      };

      if (!user?.uid) {
        Alert.alert('Error', 'You must be logged in to save recipes');
        return;
      }

      if (recipe) {
        // Update existing recipe
        await recipeRepository.saveRecipe(updatedRecipe, user.uid);
      } else {
        // Create new recipe
        await recipeRepository.saveRecipe(updatedRecipe, user.uid);

        // Link to menu item
        const db = DatabaseService.getInstance().getDB();
        await db.runAsync(
          'UPDATE pos_menu_items SET recipe_id = ?, recipe_status = ?, has_recipe = ? WHERE id = ?',
          [updatedRecipe.id, 'mapped', 1, menuItemId]
        );
      }

      Alert.alert('Success', 'Recipe saved successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (err) {
      console.error('Failed to save recipe:', err);
      Alert.alert('Error', 'Failed to save recipe');
    }
  };

  const handleDeleteMenuItem = () => {
    Alert.alert(
      'Delete Menu Item',
      `Are you sure you want to delete "${menuItemName}"? This will also delete the recipe.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = DatabaseService.getInstance().getDB();

              // Delete the recipe first if it exists
              if (recipe) {
                await recipeRepository.deleteRecipe(recipe.id);
                console.log(`✅ Deleted recipe ${recipe.id}`);
              }

              // Then delete the menu item
              await db.runAsync('DELETE FROM pos_menu_items WHERE id = ?', [menuItemId]);

              console.log(`✅ Deleted menu item ${menuItemId}`);

              Alert.alert('Success', 'Menu item deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]);
            } catch (err) {
              console.error('Failed to delete menu item:', err);
              Alert.alert('Error', 'Failed to delete menu item');
            }
          },
        },
      ]
    );
  };

  const updateIngredient = (index: number, field: keyof EditableIngredient, value: any) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };

    // Filter suggestions when name changes
    if (field === 'name' && typeof value === 'string') {
      const filtered = posIngredients.filter((ing) =>
        ing.name.toLowerCase().includes(value.toLowerCase())
      );
      updated[index].filteredSuggestions = filtered;
      updated[index].showDropdown = value.length > 0;
    }

    setIngredients(updated);
  };

  const handleCreateNewIngredient = async (index: number) => {
    const ingredient = ingredients[index];

    if (!ingredient.name.trim()) {
      Alert.alert('Error', 'Please enter an ingredient name');
      return;
    }

    if (!ingredient.unit.trim()) {
      Alert.alert('Error', 'Please enter a unit for this ingredient');
      return;
    }

    try {
      const db = DatabaseService.getInstance().getDB();
      const now = Date.now();
      const newIngId = `ing_${now}`;
      const posId = `pos_${now}`;

      await db.runAsync(
        'INSERT INTO pos_ingredients (id, name, unit, pack_size, pos_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [newIngId, ingredient.name, ingredient.unit, null, posId, 1, now, now]
      );

      // Update the ingredient to link to the new POS ingredient
      const updated = [...ingredients];
      updated[index] = {
        ...updated[index],
        posIngredientId: newIngId,
        isNew: true,
        showDropdown: false,
      };
      setIngredients(updated);

      Alert.alert('Success', `Created new ingredient: ${ingredient.name}`);
    } catch (err) {
      console.error('Failed to create ingredient:', err);
      Alert.alert('Error', 'Failed to create ingredient');
    }
  };

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { name: '', quantity: 0, unit: '', showDropdown: false, filteredSuggestions: [] },
    ]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const selectPOSIngredient = (
    index: number,
    posIng: { id: string; name: string; unit: string }
  ) => {
    const updated = [...ingredients];
    updated[index] = {
      ...updated[index],
      name: posIng.name,
      unit: posIng.unit,
      posIngredientId: posIng.id,
      showDropdown: false,
    };
    setIngredients(updated);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={[styles.content, styles.centerContent]}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={28} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>{menuItemName}</Text>
            <Text style={styles.subtitle}>{recipe ? 'Edit Recipe' : 'Create New Recipe'}</Text>
          </View>
          <TouchableOpacity onPress={handleDeleteMenuItem} style={styles.headerDeleteButton}>
            <IconSymbol name="trash" size={22} color="#f44336" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Recipe Name Card */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Recipe Name</Text>
            <TextInput
              style={styles.recipeNameInput}
              value={recipeName}
              onChangeText={setRecipeName}
              placeholder="Enter recipe name..."
              placeholderTextColor="#999"
            />
          </View>

          {/* Ingredients Section */}
          <View style={styles.ingredientsSection}>
            <View style={styles.ingredientsSectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Ingredients</Text>
                <Text style={styles.sectionSubtitle}>{ingredients.length} {ingredients.length === 1 ? 'item' : 'items'}</Text>
              </View>
              <TouchableOpacity onPress={addIngredient} style={styles.addIngredientButton}>
                <IconSymbol name="plus" size={18} color="#fff" />
                <Text style={styles.addIngredientButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {ingredients.map((ing, index) => (
              <View key={index} style={styles.ingredientCard}>
                <View style={styles.ingredientCardHeader}>
                  <View style={styles.ingredientNumberBadge}>
                    <Text style={styles.ingredientNumberText}>{index + 1}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.removeButton}>
                    <IconSymbol name="xmark.circle.fill" size={24} color="#ff5252" />
                  </TouchableOpacity>
                </View>

                <View style={styles.ingredientInputs}>
                  {/* Name Input with Autocomplete */}
                  <View style={styles.nameInputContainer}>
                    <Text style={styles.inputLabel}>Ingredient Name</Text>
                    <TextInput
                      style={[styles.nameInput, ing.posIngredientId && styles.nameInputMatched]}
                      placeholder="Start typing to search..."
                      value={ing.name}
                      onChangeText={(text) => updateIngredient(index, 'name', text)}
                      onFocus={() => {
                        if (ing.name && !ing.posIngredientId) {
                          updateIngredient(index, 'showDropdown', true);
                        }
                      }}
                      placeholderTextColor="#999"
                    />

                    {/* Show suggestions if there are matches */}
                    {ing.showDropdown && ing.filteredSuggestions && ing.filteredSuggestions.length > 0 && (
                      <View style={styles.dropdown}>
                        <FlatList
                          data={ing.filteredSuggestions}
                          keyExtractor={(item) => item.id}
                          renderItem={({ item }) => (
                            <TouchableOpacity
                              style={styles.dropdownItem}
                              onPress={() => selectPOSIngredient(index, item)}
                            >
                              <IconSymbol name="cube.fill" size={16} color="#2196f3" />
                              <Text style={styles.dropdownItemText}>{item.name}</Text>
                              <Text style={styles.dropdownItemUnit}>{item.unit}</Text>
                            </TouchableOpacity>
                          )}
                          scrollEnabled={false}
                        />
                      </View>
                    )}

                    {/* Always show "Create new ingredient" when typing and not matched */}
                    {ing.name.trim().length > 0 && !ing.posIngredientId && (
                      <TouchableOpacity
                        style={styles.createNewButton}
                        onPress={() => handleCreateNewIngredient(index)}
                      >
                        <IconSymbol name="plus.circle" size={16} color="#4caf50" />
                        <Text style={styles.createNewText}>Create new ingredient</Text>
                      </TouchableOpacity>
                    )}

                    {ing.posIngredientId && (
                      <View style={styles.matchedBadge}>
                        <IconSymbol name="checkmark.circle.fill" size={14} color="#4caf50" />
                        <Text style={styles.matchedText}>Matched to inventory</Text>
                      </View>
                    )}
                  </View>

                  {/* Quantity and Unit */}
                  <View style={styles.row}>
                    <View style={styles.quantityContainer}>
                      <Text style={styles.inputLabel}>Quantity</Text>
                      <TextInput
                        style={styles.quantityInput}
                        value={ing.quantity > 0 ? ing.quantity.toString() : ''}
                        onChangeText={(text) =>
                          updateIngredient(index, 'quantity', parseFloat(text) || 0)
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#999"
                      />
                    </View>

                    <View style={styles.unitContainer}>
                      <Text style={styles.inputLabel}>Unit</Text>
                      <TextInput
                        style={styles.unitInput}
                        value={ing.unit}
                        onChangeText={(text) => updateIngredient(index, 'unit', text)}
                        placeholder="oz, cup, etc"
                        placeholderTextColor="#999"
                      />
                    </View>
                  </View>
                </View>
              </View>
            ))}

            {ingredients.length === 0 && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <IconSymbol name="cube.fill" size={40} color="#bdbdbd" />
                </View>
                <Text style={styles.emptyText}>No ingredients yet</Text>
                <Text style={styles.emptySubtext}>Tap "Add" above to create your first ingredient</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveRecipe}>
            <IconSymbol name="checkmark.circle.fill" size={22} color="#fff" />
            <Text style={styles.saveButtonText}>Save Recipe</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  content: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8eaed',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
    fontWeight: '500',
  },
  headerDeleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  scrollView: {
    flex: 1,
  },
  // Recipe Name Card
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recipeNameInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '500',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // Ingredients Section
  ingredientsSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  ingredientsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
    fontWeight: '500',
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#4caf50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  addIngredientButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  // Ingredient Card
  ingredientCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  ingredientCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ingredientNumberBadge: {
    backgroundColor: '#e3f2fd',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ingredientNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976d2',
  },
  removeButton: {
    padding: 4,
  },
  ingredientInputs: {
    gap: 14,
  },
  nameInputContainer: {
    position: 'relative',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nameInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  nameInputMatched: {
    borderColor: '#4caf50',
    backgroundColor: '#f1f8f4',
  },
  // Autocomplete Dropdown
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f7fa',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  dropdownItemUnit: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  createNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#4caf50',
  },
  createNewText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2e7d32',
  },
  matchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 5,
  },
  matchedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2e7d32',
  },
  // Quantity and Unit
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  quantityContainer: {
    flex: 1,
  },
  unitContainer: {
    flex: 1,
  },
  quantityInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e8eaed',
    fontWeight: '500',
  },
  unitInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e8eaed',
    fontWeight: '500',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
    marginHorizontal: 16,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f5f7fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Footer
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8eaed',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196f3',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#2196f3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
