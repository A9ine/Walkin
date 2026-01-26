import { TopBar } from '@/components/TopBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import type { POSIngredient } from '@/types/pos';
import React, { useState } from 'react';
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

  const { ingredients, loading, error, createIngredient, updateIngredient, deleteIngredient } =
    usePOSIngredients();

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
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <TopBar />
        <View style={[styles.content, styles.centerContent]}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading ingredients...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <TopBar />
        <View style={[styles.content, styles.centerContent]}>
          <Text style={styles.errorText}>Error: {error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar />

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
          <View style={styles.unitBadge}>
            <Text style={styles.unitText}>{ingredient.unit}</Text>
          </View>

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
  const [unit, setUnit] = useState('');
  const [packSize, setPackSize] = useState('');
  const [aliases, setAliases] = useState('');

  React.useEffect(() => {
    if (ingredient) {
      setName(ingredient.name);
      setUnit(ingredient.unit);
      setPackSize(ingredient.packSize || '');
      setAliases(ingredient.aliases?.join(', ') || '');
    } else {
      setName('');
      setUnit('');
      setPackSize('');
      setAliases('');
    }
  }, [ingredient, visible]);

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

          <ScrollView style={styles.modalBody}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., All-Purpose Flour"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Unit *</Text>
            <TextInput
              style={styles.input}
              value={unit}
              onChangeText={setUnit}
              placeholder="e.g., cup, oz, tsp"
              placeholderTextColor="#999"
            />

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
});
