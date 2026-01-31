import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import { useRecipes } from '@/hooks/database/useRecipes';
import type { POSIngredient } from '@/types/pos';
import type { ConfidenceLevel, Ingredient, Recipe, RecipeStatus } from '@/types/recipe';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface IngredientInput extends Ingredient {
  id: string;
  showDropdown?: boolean;
  filteredSuggestions?: POSIngredient[];
}

export default function TextImportScreen() {
  const [recipeName, setRecipeName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientInput[]>([
    { id: '1', name: '', quantity: 0, unit: '' },
  ]);
  const [showNewIngredientModal, setShowNewIngredientModal] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);

  const { ingredients: posIngredients, createIngredient } = usePOSIngredients();
  const { saveRecipe } = useRecipes();

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { id: Date.now().toString(), name: '', quantity: 0, unit: '' },
    ]);
  };

  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  };

  const updateIngredient = (id: string, field: keyof IngredientInput, value: any) => {
    setIngredients(
      ingredients.map((ing) => {
        if (ing.id === id) {
          const updated = { ...ing, [field]: value };

          // If updating name, filter suggestions
          if (field === 'name') {
            const query = value.toLowerCase();
            const filtered = posIngredients.filter(
              (pos) =>
                pos.name.toLowerCase().includes(query) ||
                pos.aliases?.some((alias) => alias.toLowerCase().includes(query))
            );
            updated.filteredSuggestions = filtered;
            updated.showDropdown = query.length > 0 && filtered.length > 0;
          }

          return updated;
        }
        return ing;
      })
    );
  };

  const selectPOSIngredient = (ingredientId: string, posIngredient: POSIngredient) => {
    setIngredients(
      ingredients.map((ing) => {
        if (ing.id === ingredientId) {
          return {
            ...ing,
            name: posIngredient.name,
            unit: posIngredient.unit,
            posIngredientId: posIngredient.id,
            showDropdown: false,
            isNew: false,
          };
        }
        return ing;
      })
    );
  };

  const handleCreateNewIngredient = (ingredientId: string) => {
    setEditingIngredientId(ingredientId);
    setShowNewIngredientModal(true);
  };

  const saveNewIngredient = async (newPOSIngredient: Omit<POSIngredient, 'id' | 'posId' | 'usedInRecipes'>) => {
    try {
      const newId = `ing_${Date.now()}`;
      const fullIngredient = {
        ...newPOSIngredient,
        id: newId,
        posId: `pos_${newId}`,
      };

      await createIngredient(fullIngredient);

      if (editingIngredientId) {
        setIngredients(
          ingredients.map((ing) => {
            if (ing.id === editingIngredientId) {
              return {
                ...ing,
                name: newPOSIngredient.name,
                unit: newPOSIngredient.unit,
                posIngredientId: newId,
                isNew: true,
              };
            }
            return ing;
          })
        );
      }

      setShowNewIngredientModal(false);
      setEditingIngredientId(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to create ingredient');
    }
  };

  const handleSaveRecipe = async () => {
    if (!recipeName.trim()) {
      Alert.alert('Error', 'Please enter a recipe name');
      return;
    }

    const filledIngredients = ingredients.filter(
      (ing) => ing.name.trim() && ing.quantity > 0 && ing.unit.trim()
    );

    if (filledIngredients.length === 0) {
      Alert.alert('Error', 'Please add at least one ingredient');
      return;
    }

    // Check for unmatched ingredients
    const unmatchedIngredients = filledIngredients.filter((ing) => !ing.posIngredientId);

    if (unmatchedIngredients.length > 0) {
      Alert.alert(
        'Unmatched Ingredients',
        `${unmatchedIngredients.length} ingredient(s) are not linked to your inventory. Create them first or match to existing ingredients.`,
        [{ text: 'OK' }]
      );
      return;
    }

    const recipe: Recipe = {
      id: `recipe_${Date.now()}`,
      name: recipeName.trim(),
      status: 'ready_to_import' as RecipeStatus,
      confidence: 'high' as ConfidenceLevel,
      lastUpdated: new Date(),
      createdAt: new Date(),
      source: {
        type: 'text',
        content: `Manual entry: ${recipeName}`,
        uploadedAt: new Date(),
      },
      ingredients: filledIngredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        posIngredientId: ing.posIngredientId,
        isNew: ing.isNew,
      })),
      issues: [],
    };

    try {
      await saveRecipe(recipe);
      Alert.alert('Success', 'Recipe saved successfully', [
        {
          text: 'OK',
          onPress: () => router.push('/(tabs)/inbox'),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to save recipe');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Manual Recipe Entry</Text>
          <Text style={styles.subtitle}>Create a recipe from scratch</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Recipe Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Chocolate Chip Cookie"
            value={recipeName}
            onChangeText={setRecipeName}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Ingredients *</Text>
            <TouchableOpacity style={styles.addButton} onPress={addIngredient}>
              <IconSymbol name="plus.circle.fill" size={24} color="#2196f3" />
            </TouchableOpacity>
          </View>

          {ingredients.map((ingredient, index) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              index={index}
              posIngredients={posIngredients}
              onUpdate={(field, value) => updateIngredient(ingredient.id, field, value)}
              onSelect={(posIng) => selectPOSIngredient(ingredient.id, posIng)}
              onCreateNew={() => handleCreateNewIngredient(ingredient.id)}
              onRemove={() => removeIngredient(ingredient.id)}
              showRemove={ingredients.length > 1}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveRecipe}>
          <Text style={styles.saveButtonText}>Save Recipe</Text>
        </TouchableOpacity>
      </ScrollView>

      <NewIngredientModal
        visible={showNewIngredientModal}
        onClose={() => {
          setShowNewIngredientModal(false);
          setEditingIngredientId(null);
        }}
        onSave={saveNewIngredient}
      />
    </SafeAreaView>
  );
}

function IngredientRow({
  ingredient,
  index,
  posIngredients,
  onUpdate,
  onSelect,
  onCreateNew,
  onRemove,
  showRemove,
}: {
  ingredient: IngredientInput;
  index: number;
  posIngredients: POSIngredient[];
  onUpdate: (field: keyof IngredientInput, value: any) => void;
  onSelect: (posIngredient: POSIngredient) => void;
  onCreateNew: () => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  return (
    <View style={styles.ingredientRow}>
      <View style={styles.ingredientHeader}>
        <Text style={styles.ingredientIndex}>#{index + 1}</Text>
        {showRemove && (
          <TouchableOpacity onPress={onRemove}>
            <IconSymbol name="trash.fill" size={18} color="#f44336" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.ingredientInputs}>
        <View style={styles.nameInputContainer}>
          <Text style={styles.inputLabel}>Ingredient Name</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="Start typing..."
            value={ingredient.name}
            onChangeText={(text) => onUpdate('name', text)}
            onFocus={() => {
              if (ingredient.name && !ingredient.posIngredientId) {
                onUpdate('showDropdown', true);
              }
            }}
            placeholderTextColor="#999"
          />

          {/* Show suggestions if there are matches */}
          {ingredient.showDropdown && ingredient.filteredSuggestions && ingredient.filteredSuggestions.length > 0 && (
            <View style={styles.dropdown}>
              <FlatList
                data={ingredient.filteredSuggestions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => onSelect(item)}
                  >
                    <View style={styles.dropdownItemLeft}>
                      <IconSymbol name="cube.fill" size={16} color="#2196f3" />
                      <Text style={styles.dropdownItemText}>{item.name}</Text>
                    </View>
                    <Text style={styles.dropdownItemUnit}>{item.unit}</Text>
                  </TouchableOpacity>
                )}
                scrollEnabled={false}
                nestedScrollEnabled
              />
            </View>
          )}

          {/* Always show "Create new ingredient" when typing and not matched */}
          {ingredient.name.trim().length > 0 && !ingredient.posIngredientId && (
            <TouchableOpacity style={styles.createNewButton} onPress={onCreateNew}>
              <IconSymbol name="plus.circle" size={16} color="#4caf50" />
              <Text style={styles.createNewText}>Create new ingredient</Text>
            </TouchableOpacity>
          )}

          {ingredient.posIngredientId && (
            <View style={styles.matchedBadge}>
              <IconSymbol name="checkmark.circle.fill" size={14} color="#4caf50" />
              <Text style={styles.matchedText}>Matched to inventory</Text>
            </View>
          )}
        </View>

        <View style={styles.row}>
          <View style={styles.quantityContainer}>
            <Text style={styles.inputLabel}>Quantity</Text>
            <TextInput
              style={styles.quantityInput}
              placeholder="0"
              value={ingredient.quantity > 0 ? ingredient.quantity.toString() : ''}
              onChangeText={(text) => onUpdate('quantity', parseFloat(text) || 0)}
              keyboardType="decimal-pad"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.unitContainer}>
            <Text style={styles.inputLabel}>Unit</Text>
            <TextInput
              style={styles.unitInput}
              placeholder="oz, cup, tsp"
              value={ingredient.unit}
              onChangeText={(text) => onUpdate('unit', text)}
              placeholderTextColor="#999"
              editable={!ingredient.posIngredientId}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function NewIngredientModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (ingredient: Omit<POSIngredient, 'id' | 'posId' | 'usedInRecipes'>) => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [packSize, setPackSize] = useState('');
  const [aliases, setAliases] = useState('');

  const handleSave = () => {
    if (!name.trim() || !unit.trim()) {
      Alert.alert('Error', 'Name and unit are required');
      return;
    }

    const aliasArray = aliases
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    onSave({
      name: name.trim(),
      unit: unit.trim(),
      packSize: packSize.trim() || undefined,
      aliases: aliasArray.length > 0 ? aliasArray : undefined,
      isActive: true,
    });

    // Reset form
    setName('');
    setUnit('');
    setPackSize('');
    setAliases('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create New Ingredient</Text>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalLabel}>Name *</Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Heavy Cream"
              placeholderTextColor="#999"
            />

            <Text style={styles.modalLabel}>Unit *</Text>
            <TextInput
              style={styles.modalInput}
              value={unit}
              onChangeText={setUnit}
              placeholder="e.g., cup, oz, tsp"
              placeholderTextColor="#999"
            />

            <Text style={styles.modalLabel}>Pack Size</Text>
            <TextInput
              style={styles.modalInput}
              value={packSize}
              onChangeText={setPackSize}
              placeholder="e.g., 1 quart"
              placeholderTextColor="#999"
            />

            <Text style={styles.modalLabel}>Aliases (comma-separated)</Text>
            <TextInput
              style={styles.modalInput}
              value={aliases}
              onChangeText={setAliases}
              placeholder="e.g., Cream, Whipping Cream"
              placeholderTextColor="#999"
              multiline
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    marginTop: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addButton: {
    padding: 4,
  },
  ingredientRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ingredientIndex: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2196f3',
  },
  ingredientInputs: {
    gap: 12,
  },
  nameInputContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#333',
  },
  dropdown: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1001,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#333',
  },
  dropdownItemUnit: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  createNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    backgroundColor: '#f0f9f4',
  },
  createNewText: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: '600',
  },
  matchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  matchedText: {
    fontSize: 11,
    color: '#4caf50',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  quantityContainer: {
    flex: 1,
  },
  quantityInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#333',
  },
  unitContainer: {
    flex: 1,
  },
  unitInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#2196f3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#333',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalSaveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#2196f3',
    alignItems: 'center',
  },
});
