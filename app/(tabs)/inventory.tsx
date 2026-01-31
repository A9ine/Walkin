import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import type { POSIngredient } from '@/types/pos';
import { useFocusEffect } from 'expo-router';
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
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

export default function InventoryScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<POSIngredient | null>(null);

  const { ingredients, loading, error, loadIngredients, createIngredient, updateIngredient, deleteIngredient } =
    usePOSIngredients();

  // Reload ingredients when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadIngredients();
    }, [loadIngredients])
  );

  const handleAddNew = () => {
    setEditingIngredient(null);
    setShowModal(true);
  };

  const handleEdit = (ingredient: POSIngredient) => {
    setEditingIngredient(ingredient);
    setShowModal(true);
  };

  const handleDelete = (ingredient: POSIngredient) => {
    Alert.alert(
      'Delete Ingredient',
      `Delete "${ingredient.name}"?${
        ingredient.usedInRecipes.length > 0
          ? `\n\nUsed in ${ingredient.usedInRecipes.length} recipe(s).`
          : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIngredient(ingredient.id);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const getFilteredIngredients = () => {
    if (!searchQuery) return ingredients;
    return ingredients.filter(
      (ing) =>
        ing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ing.aliases?.some((alias) => alias.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={[styles.content, styles.centerContent]}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading ingredients...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={[styles.content, styles.centerContent]}>
          <Text style={styles.errorText}>Error: {error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      
      <View style={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Inventory</Text>
            <Text style={styles.subtitle}>Master list of ingredients</Text>
          </View>

          <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
            <IconSymbol name="plus" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <IconSymbol name="magnifyingglass" size={18} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search ingredients..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        <FlatList
          data={getFilteredIngredients()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <IngredientCard
              ingredient={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <IngredientModal
        visible={showModal}
        ingredient={editingIngredient}
        onClose={() => setShowModal(false)}
        onSave={async (data) => {
          try {
            if (editingIngredient) {
              await updateIngredient(editingIngredient.id, data);
            } else {
              const newId = `ing_${Date.now()}`;
              await createIngredient({ ...data, id: newId, posId: `pos_${newId}` });
            }
            setShowModal(false);
          } catch (err) {
            Alert.alert('Error', 'Failed to save ingredient');
          }
        }}
      />
    </SafeAreaView>
  );
}

function IngredientCard({
  ingredient,
  onEdit,
  onDelete,
}: {
  ingredient: POSIngredient;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isUnused = ingredient.usedInRecipes.length === 0;

  return (
    <TouchableOpacity style={[styles.card, isUnused && styles.unusedCard]} onPress={onEdit}>
      <View style={styles.cardLeft}>
        <IconSymbol
          name={isUnused ? 'exclamationmark.triangle.fill' : 'cube.fill'}
          size={24}
          color={isUnused ? '#f44336' : '#2196f3'}
        />
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.ingredientName}>{ingredient.name}</Text>

        <View style={styles.metaRow}>
          {/* Show primary unit with star, then other units */}
          <View style={styles.unitBadge}>
            <IconSymbol name="star.fill" size={10} color="#1976d2" />
            <Text style={styles.unitText}>{ingredient.unit}</Text>
          </View>

          {/* Show additional supported units */}
          {ingredient.supportedUnits && ingredient.supportedUnits.length > 1 && (
            ingredient.supportedUnits
              .filter(u => u.unit !== ingredient.unit)
              .slice(0, 3)
              .map((u, idx) => (
                <View key={idx} style={styles.secondaryUnitBadge}>
                  <Text style={styles.secondaryUnitText}>{u.unit}</Text>
                </View>
              ))
          )}

          {ingredient.supportedUnits && ingredient.supportedUnits.length > 4 && (
            <View style={styles.moreUnitsBadge}>
              <Text style={styles.moreUnitsText}>+{ingredient.supportedUnits.length - 4}</Text>
            </View>
          )}

          {ingredient.packSize && (
            <View style={styles.packSizeBadge}>
              <IconSymbol name="shippingbox.fill" size={12} color="#666" />
              <Text style={styles.packSizeText}>{ingredient.packSize}</Text>
            </View>
          )}
        </View>

        {ingredient.aliases && ingredient.aliases.length > 0 && (
          <View style={styles.aliasesRow}>
            <Text style={styles.aliasesLabel}>Also known as: </Text>
            <Text style={styles.aliasesText}>{ingredient.aliases.join(', ')}</Text>
          </View>
        )}

        <View style={styles.recipesRow}>
          <IconSymbol name="doc.text" size={14} color="#999" />
          <Text style={styles.recipesText}>
            {ingredient.usedInRecipes.length > 0
              ? `Used in ${ingredient.usedInRecipes.length} recipe${
                  ingredient.usedInRecipes.length > 1 ? 's' : ''
                }`
              : 'Not used in any recipes'}
          </Text>
        </View>
      </View>

      <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
        <IconSymbol name="trash.fill" size={20} color="#f44336" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// Available units for selection
const AVAILABLE_UNITS = [
  { value: 'oz', label: 'Ounces (oz)' },
  { value: 'lb', label: 'Pounds (lb)' },
  { value: 'g', label: 'Grams (g)' },
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'cup', label: 'Cups' },
  { value: 'tbsp', label: 'Tablespoons (tbsp)' },
  { value: 'tsp', label: 'Teaspoons (tsp)' },
  { value: 'ml', label: 'Milliliters (ml)' },
  { value: 'l', label: 'Liters (l)' },
  { value: 'gallon', label: 'Gallons' },
  { value: 'quart', label: 'Quarts' },
  { value: 'pint', label: 'Pints' },
  { value: 'fl oz', label: 'Fluid Ounces (fl oz)' },
  { value: 'each', label: 'Each/Count' },
];

function IngredientModal({
  visible,
  ingredient,
  onClose,
  onSave,
}: {
  visible: boolean;
  ingredient: POSIngredient | null;
  onClose: () => void;
  onSave: (data: Omit<POSIngredient, 'id' | 'posId' | 'usedInRecipes'>) => void;
}) {
  const [name, setName] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [primaryUnit, setPrimaryUnit] = useState('');
  const [packSize, setPackSize] = useState('');
  const [aliases, setAliases] = useState('');

  React.useEffect(() => {
    if (ingredient) {
      setName(ingredient.name);
      setPrimaryUnit(ingredient.unit);
      // Get selected units from supportedUnits or default to just the primary unit
      const units = ingredient.supportedUnits
        ? ingredient.supportedUnits.map(u => u.unit)
        : [ingredient.unit];
      setSelectedUnits(units);
      setPackSize(ingredient.packSize || '');
      setAliases(ingredient.aliases?.join(', ') || '');
    } else {
      setName('');
      setSelectedUnits([]);
      setPrimaryUnit('');
      setPackSize('');
      setAliases('');
    }
  }, [ingredient, visible]);

  const toggleUnit = (unit: string) => {
    setSelectedUnits(prev => {
      if (prev.includes(unit)) {
        // If removing the primary unit, clear it
        if (unit === primaryUnit) {
          const remaining = prev.filter(u => u !== unit);
          setPrimaryUnit(remaining[0] || '');
        }
        return prev.filter(u => u !== unit);
      } else {
        // If this is the first unit selected, make it primary
        if (prev.length === 0) {
          setPrimaryUnit(unit);
        }
        return [...prev, unit];
      }
    });
  };

  const handleSetPrimary = (unit: string) => {
    setPrimaryUnit(unit);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    if (selectedUnits.length === 0) {
      Alert.alert('Error', 'At least one unit is required');
      return;
    }

    const aliasArray = aliases
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    // Build supportedUnits array
    const supportedUnits = selectedUnits.map(unit => ({
      unit,
      conversionFactor: 1, // Default conversion factor
      isBaseUnit: unit === primaryUnit,
    }));

    onSave({
      name: name.trim(),
      unit: primaryUnit || selectedUnits[0], // Primary unit
      supportedUnits,
      packSize: packSize.trim() || undefined,
      aliases: aliasArray.length > 0 ? aliasArray : undefined,
      isActive: true,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {ingredient ? 'Edit Ingredient' : 'Add Ingredient'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., All-Purpose Flour"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Units of Measurement *</Text>
            <Text style={styles.labelHint}>Select all units this ingredient can use. Tap the star to set the primary unit.</Text>

            <View style={styles.unitsGrid}>
              {AVAILABLE_UNITS.map((unitOption) => {
                const isSelected = selectedUnits.includes(unitOption.value);
                const isPrimary = primaryUnit === unitOption.value;

                return (
                  <View key={unitOption.value} style={styles.unitCheckboxRow}>
                    <TouchableOpacity
                      style={[
                        styles.unitCheckbox,
                        isSelected && styles.unitCheckboxSelected,
                      ]}
                      onPress={() => toggleUnit(unitOption.value)}
                    >
                      <View style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}>
                        {isSelected && (
                          <IconSymbol name="checkmark" size={12} color="#fff" />
                        )}
                      </View>
                      <Text style={[
                        styles.unitCheckboxLabel,
                        isSelected && styles.unitCheckboxLabelSelected,
                      ]}>
                        {unitOption.label}
                      </Text>
                    </TouchableOpacity>

                    {isSelected && (
                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => handleSetPrimary(unitOption.value)}
                      >
                        <IconSymbol
                          name={isPrimary ? 'star.fill' : 'star'}
                          size={18}
                          color={isPrimary ? '#ffc107' : '#ccc'}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>

            {selectedUnits.length > 0 && (
              <View style={styles.selectedUnitsPreview}>
                <Text style={styles.selectedUnitsLabel}>Selected: </Text>
                <Text style={styles.selectedUnitsText}>
                  {selectedUnits.map(u => u === primaryUnit ? `${u} (primary)` : u).join(', ')}
                </Text>
              </View>
            )}

            <Text style={styles.label}>Pack Size</Text>
            <TextInput
              style={styles.input}
              value={packSize}
              onChangeText={setPackSize}
              placeholder="e.g., 5 lb bag"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Aliases (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={aliases}
              onChangeText={setAliases}
              placeholder="e.g., AP Flour, Flour"
              placeholderTextColor="#999"
              multiline
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    padding: 20,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196f3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  list: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  unusedCard: {
    borderWidth: 2,
    borderColor: '#f44336',
  },
  cardLeft: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  unitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1976d2',
  },
  secondaryUnitBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  secondaryUnitText: {
    fontSize: 11,
    color: '#666',
  },
  moreUnitsBadge: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  moreUnitsText: {
    fontSize: 11,
    color: '#999',
  },
  packSizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  packSizeText: {
    fontSize: 11,
    color: '#666',
  },
  aliasesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  aliasesLabel: {
    fontSize: 12,
    color: '#999',
  },
  aliasesText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  recipesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recipesText: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 8,
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
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
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#2196f3',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  labelHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
    marginTop: -4,
  },
  unitsGrid: {
    gap: 8,
  },
  unitCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unitCheckbox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 10,
  },
  unitCheckboxSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxSelected: {
    backgroundColor: '#2196f3',
    borderColor: '#2196f3',
  },
  unitCheckboxLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  unitCheckboxLabelSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  primaryButton: {
    padding: 8,
    marginLeft: 8,
  },
  selectedUnitsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  selectedUnitsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2e7d32',
  },
  selectedUnitsText: {
    fontSize: 13,
    color: '#4caf50',
    flex: 1,
  },
});
