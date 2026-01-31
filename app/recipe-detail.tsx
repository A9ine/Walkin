import { IconSymbol } from '@/components/ui/icon-symbol';
import { recipeRepository } from '@/database/repositories/recipe.repository';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import { squareExportService } from '@/services/square/square-export.service';
import type { Recipe } from '@/types/recipe';
import type { POSIngredient } from '@/types/pos';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Common measurement units
const UNITS = ['oz', 'cup', 'tsp', 'tbsp', 'each', 'lb', 'g', 'ml', 'l', 'gallon', 'quart', 'pint'];

interface EditableIngredient {
  name: string;
  quantity: number;
  unit: string;
  originalUnit?: string;
  unitUnclear?: boolean;
  posIngredientId?: string;
  isNew?: boolean;
  confidence?: string;
  showIngredientDropdown?: boolean;
  showUnitDropdown?: boolean;
  searchQuery?: string;
}

interface SimilarIngredient {
  ingredient: POSIngredient;
  similarity: number;
}

export default function RecipeDetailScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const router = useRouter();
  const { ingredients: posIngredients, createIngredient } = usePOSIngredients();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([]);
  const [issues, setIssues] = useState<Recipe['issues']>([]);

  // Quick Add Modal State
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddIndex, setQuickAddIndex] = useState<number | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddUnit, setQuickAddUnit] = useState('');
  const [quickAddAliases, setQuickAddAliases] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  useEffect(() => {
    loadRecipe();
  }, [recipeId]);

  const loadRecipe = async () => {
    try {
      setLoading(true);
      const recipeData = await recipeRepository.getRecipeById(recipeId);

      if (!recipeData) {
        Alert.alert('Error', 'Recipe not found');
        router.back();
        return;
      }

      setRecipe(recipeData);
      setRecipeName(recipeData.name);
      setIssues(recipeData.issues || []);
      setIngredients(
        recipeData.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          originalUnit: ing.originalUnit,
          unitUnclear: ing.unitUnclear,
          posIngredientId: ing.posIngredientId,
          isNew: ing.isNew,
          confidence: ing.confidence,
          showIngredientDropdown: false,
          showUnitDropdown: false,
          searchQuery: ing.name,
        }))
      );
    } catch (err) {
      console.error('Failed to load recipe:', err);
      Alert.alert('Error', 'Failed to load recipe');
    } finally {
      setLoading(false);
    }
  };

  // Find duplicate ingredients (same name, case-insensitive)
  const findDuplicates = (currentIngredients: EditableIngredient[]): Map<string, number[]> => {
    const nameToIndices = new Map<string, number[]>();

    currentIngredients.forEach((ing, index) => {
      if (ing.name.trim().length > 0) {
        const normalizedName = ing.name.trim().toLowerCase();
        const existing = nameToIndices.get(normalizedName) || [];
        existing.push(index);
        nameToIndices.set(normalizedName, existing);
      }
    });

    // Only return groups with duplicates (2+ ingredients)
    const duplicates = new Map<string, number[]>();
    nameToIndices.forEach((indices, name) => {
      if (indices.length > 1) {
        duplicates.set(name, indices);
      }
    });

    return duplicates;
  };

  // Detect duplicates when ingredients change
  useEffect(() => {
    if (ingredients.length > 0 && !loading) {
      // Check for duplicates and update issues
      const duplicates = findDuplicates(ingredients);
      if (duplicates.size > 0) {
        setIssues(prevIssues => {
          const newIssues = [...prevIssues];

          // Add duplicate issues that don't already exist
          duplicates.forEach((indices, normalizedName) => {
            const existingIssue = newIssues.find(
              i => i.type === 'duplicate_ingredient' && i.ingredientName?.toLowerCase() === normalizedName
            );
            if (!existingIssue) {
              const ingredientName = ingredients[indices[0]].name;
              const quantities = indices.map(i => `${ingredients[i].quantity} ${ingredients[i].unit}`);
              newIssues.push({
                type: 'duplicate_ingredient',
                message: `"${ingredientName}" appears ${indices.length} times (${quantities.join(', ')})`,
                ingredientName: ingredientName,
                suggestedFix: `Merge quantities or keep separate entries`,
                duplicateIndices: indices,
              });
            }
          });

          return newIssues;
        });
      }
    }
  }, [ingredients, loading]);

  // Recalculate issues based on current ingredient state
  // Only removes issues that are actually resolved, preserves others
  const recalculateIssues = (currentIngredients: EditableIngredient[]) => {
    setIssues(prevIssues => {
      const newIssues: Recipe['issues'] = [];

      // Find current duplicates
      const duplicates = findDuplicates(currentIngredients);

      // Keep issues that are still relevant
      prevIssues.forEach((issue) => {
        // Handle duplicate_ingredient issues separately
        if (issue.type === 'duplicate_ingredient') {
          // Check if this duplicate group still exists
          const normalizedName = issue.ingredientName?.toLowerCase();
          if (normalizedName && duplicates.has(normalizedName)) {
            // Update the indices and keep the issue
            const indices = duplicates.get(normalizedName)!;
            newIssues.push({
              ...issue,
              duplicateIndices: indices,
            });
            // Mark as handled so we don't add it again below
            duplicates.delete(normalizedName);
          }
          // If no longer duplicated, don't add the issue
          return;
        }

        const relatedIngredient = currentIngredients.find(
          ing => ing.name === issue.ingredientName
        );

        // If ingredient was removed, remove the issue
        if (!relatedIngredient) {
          return;
        }

        // Check if issue is resolved
        if (issue.type === 'ingredient_not_found') {
          // Keep if ingredient is still unmatched
          if (!relatedIngredient.posIngredientId) {
            newIssues.push(issue);
          }
          // Otherwise, issue is resolved - don't add it
        } else if (issue.type === 'unit_unclear') {
          // Keep if unit is still unclear
          if (relatedIngredient.unitUnclear) {
            newIssues.push(issue);
          }
          // Otherwise, issue is resolved - don't add it
        } else if (issue.type === 'similar_ingredient') {
          // Keep if ingredient hasn't been explicitly matched
          if (!relatedIngredient.posIngredientId) {
            newIssues.push(issue);
          }
          // If matched, the similar_ingredient issue is resolved
        } else {
          // Keep other issue types
          newIssues.push(issue);
        }
      });

      // Add new issues for unmatched ingredients that don't already have an issue
      currentIngredients.forEach((ing) => {
        // Check for unmatched ingredients
        if (!ing.posIngredientId && ing.name.length > 0) {
          const existingIssue = newIssues.find(
            i => i.ingredientName === ing.name && i.type === 'ingredient_not_found'
          );
          if (!existingIssue) {
            newIssues.push({
              type: 'ingredient_not_found',
              message: `"${ing.name}" is not linked to your inventory`,
              ingredientName: ing.name,
              suggestedFix: `Select a matching ingredient from inventory or add "${ing.name}" as new`,
            });
          }
        }

        // Check for unclear units
        if (ing.unitUnclear) {
          const existingIssue = newIssues.find(
            i => i.ingredientName === ing.name && i.type === 'unit_unclear'
          );
          if (!existingIssue) {
            newIssues.push({
              type: 'unit_unclear',
              message: `Unit unclear for "${ing.name}": "${ing.originalUnit || ing.unit}"`,
              ingredientName: ing.name,
              suggestedFix: `Verify the correct unit for "${ing.name}"`,
            });
          }
        }
      });

      // Add new duplicate issues for any remaining duplicates
      duplicates.forEach((indices, normalizedName) => {
        const ingredientName = currentIngredients[indices[0]].name;
        const quantities = indices.map(i => `${currentIngredients[i].quantity} ${currentIngredients[i].unit}`);
        newIssues.push({
          type: 'duplicate_ingredient',
          message: `"${ingredientName}" appears ${indices.length} times (${quantities.join(', ')})`,
          ingredientName: ingredientName,
          suggestedFix: `Merge quantities or keep separate entries`,
          duplicateIndices: indices,
        });
      });

      return newIssues;
    });
  };

  // Merge duplicate ingredients
  const mergeDuplicates = (ingredientName: string, indices: number[]) => {
    if (indices.length < 2) return;

    const updated = [...ingredients];
    const firstIndex = indices[0];
    const firstIng = updated[firstIndex];

    // Check if all duplicates have the same unit
    const allSameUnit = indices.every(i => updated[i].unit === firstIng.unit);

    if (allSameUnit) {
      // Sum all quantities
      const totalQuantity = indices.reduce((sum, i) => sum + updated[i].quantity, 0);
      updated[firstIndex] = {
        ...firstIng,
        quantity: totalQuantity,
      };

      // Remove other duplicates (in reverse order to maintain indices)
      const indicesToRemove = indices.slice(1).sort((a, b) => b - a);
      indicesToRemove.forEach(i => {
        updated.splice(i, 1);
      });

      setIngredients(updated);
      recalculateIssues(updated);

      Alert.alert(
        'Merged',
        `Combined ${indices.length} entries into ${totalQuantity} ${firstIng.unit} of "${ingredientName}"`,
      );
    } else {
      // Different units - ask user what to do
      Alert.alert(
        'Different Units',
        `The duplicate entries have different units. Please convert them to the same unit before merging, or keep them separate.`,
        [
          { text: 'Keep Separate', style: 'cancel' },
          {
            text: 'Use First Unit',
            onPress: () => {
              // Sum quantities (user accepts responsibility for unit conversion)
              const totalQuantity = indices.reduce((sum, i) => sum + updated[i].quantity, 0);
              updated[firstIndex] = {
                ...firstIng,
                quantity: totalQuantity,
              };

              const indicesToRemove = indices.slice(1).sort((a, b) => b - a);
              indicesToRemove.forEach(i => {
                updated.splice(i, 1);
              });

              setIngredients(updated);
              recalculateIssues(updated);
            },
          },
        ]
      );
    }
  };

  // Calculate Levenshtein distance for similarity matching
  const levenshteinSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    const maxLen = Math.max(m, n);
    if (maxLen === 0) return 1.0;
    return (maxLen - dp[m][n]) / maxLen;
  };

  // Get similar ingredients for unmatched ingredient
  const getSimilarIngredients = (name: string): SimilarIngredient[] => {
    if (!name || name.length < 2) return [];

    const nameLower = name.toLowerCase();
    const results: SimilarIngredient[] = [];

    for (const posIng of posIngredients) {
      // Check name match
      let similarity = levenshteinSimilarity(nameLower, posIng.name.toLowerCase());

      // Check if name contains or is contained
      if (posIng.name.toLowerCase().includes(nameLower) || nameLower.includes(posIng.name.toLowerCase())) {
        similarity = Math.max(similarity, 0.7);
      }

      // Check aliases
      if (posIng.aliases) {
        for (const alias of posIng.aliases) {
          const aliasSim = levenshteinSimilarity(nameLower, alias.toLowerCase());
          if (aliasSim > similarity) similarity = aliasSim;
          if (alias.toLowerCase().includes(nameLower) || nameLower.includes(alias.toLowerCase())) {
            similarity = Math.max(similarity, 0.7);
          }
        }
      }

      if (similarity >= 0.4) {
        results.push({ ingredient: posIng, similarity });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  };

  // Filter ingredients based on search query
  const getFilteredIngredients = (query: string): POSIngredient[] => {
    if (!query || query.length < 1) return posIngredients.slice(0, 10);

    const queryLower = query.toLowerCase();
    return posIngredients
      .filter((ing) =>
        ing.name.toLowerCase().includes(queryLower) ||
        ing.aliases?.some(alias => alias.toLowerCase().includes(queryLower))
      )
      .slice(0, 10);
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

    setSaving(true);
    try {
      const unmatchedCount = ingredients.filter((ing) => !ing.posIngredientId).length;
      const confidence = unmatchedCount === 0 ? 'high' : unmatchedCount <= 2 ? 'medium' : 'low';
      const status = unmatchedCount === 0 ? 'ready_to_import' : 'needs_review';

      const updatedRecipe: Recipe = {
        ...recipe!,
        name: recipeName.trim(),
        status,
        confidence: confidence as 'high' | 'medium' | 'low',
        lastUpdated: new Date(),
        ingredients: ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          originalUnit: ing.originalUnit,
          unitUnclear: ing.unitUnclear,
          posIngredientId: ing.posIngredientId,
          isNew: !ing.posIngredientId,
          confidence: ing.posIngredientId ? 'high' : 'low',
        })),
        issues: issues, // Use the real-time tracked issues
      };

      await recipeRepository.updateRecipe(updatedRecipe);

      Alert.alert('Success', 'Recipe saved successfully', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error('Failed to save recipe:', err);
      Alert.alert('Error', 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipe = () => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipeName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await recipeRepository.deleteRecipe(recipeId);
              router.back();
            } catch (err) {
              console.error('Failed to delete recipe:', err);
              Alert.alert('Error', 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  const handleExportToSquare = async () => {
    const unmatchedIngredients = ingredients.filter((ing) => !ing.posIngredientId);
    if (unmatchedIngredients.length > 0) {
      Alert.alert(
        'Cannot Export',
        `${unmatchedIngredients.length} ingredient(s) are not linked to your inventory. Please match all ingredients before exporting to Square.`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (!recipe) return;

    setExporting(true);
    try {
      // Update recipe with latest data before export
      const exportRecipe: Recipe = {
        ...recipe,
        name: recipeName.trim(),
        ingredients: ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          posIngredientId: ing.posIngredientId,
          isNew: false,
        })),
      };

      if (squareExportService.isConfigured()) {
        const result = await squareExportService.exportRecipe(exportRecipe);
        if (result.success) {
          Alert.alert(
            'Export Successful',
            'Recipe has been exported to Square POS.',
            [{ text: 'Great!', onPress: () => router.back() }]
          );
        } else {
          throw new Error(result.error);
        }
      } else {
        const csvContent = squareExportService.generateDetailedCSV([exportRecipe]);
        const fileName = `${recipeName.replace(/[^a-z0-9]/gi, '_')}_recipe.csv`;
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;

        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Recipe CSV',
          });
        }
      }
    } catch (err) {
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  };

  const updateIngredient = (index: number, field: keyof EditableIngredient, value: any) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };

    // Close all other dropdowns when opening one
    if (field === 'showIngredientDropdown' && value === true) {
      updated.forEach((ing, i) => {
        if (i !== index) {
          updated[i] = { ...updated[i], showIngredientDropdown: false, showUnitDropdown: false };
        }
      });
    }
    if (field === 'showUnitDropdown' && value === true) {
      updated.forEach((ing, i) => {
        if (i !== index) {
          updated[i] = { ...updated[i], showIngredientDropdown: false, showUnitDropdown: false };
        }
      });
    }

    // Update search query when typing in ingredient name
    if (field === 'searchQuery') {
      updated[index].name = value;
      updated[index].posIngredientId = undefined;
      updated[index].showIngredientDropdown = true;
    }

    setIngredients(updated);
  };

  const selectIngredient = (index: number, posIng: POSIngredient) => {
    const originalName = ingredients[index].name;
    const originalSearchQuery = ingredients[index].searchQuery;
    const updated = [...ingredients];
    updated[index] = {
      ...updated[index],
      name: posIng.name,
      unit: posIng.unit,
      posIngredientId: posIng.id,
      showIngredientDropdown: false,
      isNew: false,
      confidence: 'high',
      unitUnclear: false, // Clear unit unclear when matched
      searchQuery: posIng.name,
    };
    setIngredients(updated);

    // Directly remove issues for this ingredient (by any name it might have had)
    setIssues(prevIssues => prevIssues.filter(issue =>
      issue.ingredientName !== originalName &&
      issue.ingredientName !== originalSearchQuery &&
      issue.ingredientName !== posIng.name
    ));
    Keyboard.dismiss();
  };

  const selectUnit = (index: number, unit: string) => {
    const updated = [...ingredients];
    updated[index] = {
      ...updated[index],
      unit,
      unitUnclear: false, // Clear unit unclear when manually selected
      showUnitDropdown: false,
    };
    setIngredients(updated);
    recalculateIssues(updated);
  };

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      {
        name: '',
        quantity: 0,
        unit: 'each',
        showIngredientDropdown: false,
        showUnitDropdown: false,
        searchQuery: '',
      },
    ]);
  };

  const removeIngredient = (index: number) => {
    const updated = ingredients.filter((_, i) => i !== index);
    setIngredients(updated);
    recalculateIssues(updated);
  };

  const openQuickAddModal = (index: number) => {
    const ing = ingredients[index];
    setQuickAddIndex(index);
    setQuickAddName(ing.name);
    setQuickAddUnit(ing.unit || 'each');
    setQuickAddAliases('');
    setShowQuickAddModal(true);
  };

  const handleQuickAdd = async () => {
    if (!quickAddName.trim()) {
      Alert.alert('Error', 'Ingredient name is required');
      return;
    }
    if (!quickAddUnit.trim()) {
      Alert.alert('Error', 'Unit is required');
      return;
    }

    setQuickAddSaving(true);
    try {
      const newId = `ing_${Date.now()}`;
      const aliasArray = quickAddAliases
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      await createIngredient({
        id: newId,
        posId: `pos_${newId}`,
        name: quickAddName.trim(),
        unit: quickAddUnit.trim(),
        aliases: aliasArray.length > 0 ? aliasArray : undefined,
        isActive: true,
      });

      // Update the ingredient in the recipe
      if (quickAddIndex !== null) {
        const originalName = ingredients[quickAddIndex].name;
        const updated = [...ingredients];
        updated[quickAddIndex] = {
          ...updated[quickAddIndex],
          name: quickAddName.trim(),
          unit: quickAddUnit.trim(),
          posIngredientId: newId,
          isNew: false,
          confidence: 'high',
          unitUnclear: false,
          searchQuery: quickAddName.trim(),
        };
        setIngredients(updated);

        // Directly remove issues for this ingredient (by original name or new name)
        setIssues(prevIssues => prevIssues.filter(issue =>
          issue.ingredientName !== originalName &&
          issue.ingredientName !== quickAddName.trim()
        ));
      }

      setShowQuickAddModal(false);
      Alert.alert('Success', `"${quickAddName}" added to inventory and linked to recipe.`);
    } catch (err) {
      console.error('Failed to add ingredient:', err);
      Alert.alert('Error', 'Failed to add ingredient to inventory');
    } finally {
      setQuickAddSaving(false);
    }
  };

  const closeAllDropdowns = () => {
    setIngredients(ingredients.map(ing => ({
      ...ing,
      showIngredientDropdown: false,
      showUnitDropdown: false,
    })));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <View style={[styles.content, styles.centerContent]}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const unmatchedCount = ingredients.filter((ing) => !ing.posIngredientId).length;
  const isReadyForExport = unmatchedCount === 0 && ingredients.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={28} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Edit Recipe</Text>
            <Text style={styles.subtitle}>
              {unmatchedCount > 0
                ? `${unmatchedCount} unmatched ingredient${unmatchedCount > 1 ? 's' : ''}`
                : 'All ingredients matched'}
            </Text>
          </View>
          <TouchableOpacity onPress={handleDeleteRecipe} style={styles.headerDeleteButton}>
            <IconSymbol name="trash" size={22} color="#f44336" />
          </TouchableOpacity>
        </View>

        {/* Source Image Preview */}
        {recipe?.source.uri && (
          <View style={styles.sourcePreview}>
            <Image source={{ uri: recipe.source.uri }} style={styles.sourceImage} />
            <Text style={styles.sourceLabel}>
              {recipe.source.type === 'photo' ? 'Source Image' :
               recipe.source.type === 'pdf' ? 'PDF Import' :
               recipe.source.type === 'excel' ? 'Excel Import' : 'Text Import'}
            </Text>
          </View>
        )}

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={closeAllDropdowns}
          keyboardShouldPersistTaps="handled"
        >
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

          {/* Status Summary */}
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusItem}>
                <IconSymbol
                  name={isReadyForExport ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
                  size={20}
                  color={isReadyForExport ? '#4caf50' : '#f44336'}
                />
                <Text style={styles.statusItemText}>
                  {isReadyForExport ? 'Ready for Export' : 'Needs Review'}
                </Text>
              </View>
              <View style={styles.statusItem}>
                <IconSymbol name="list.bullet" size={18} color="#666" />
                <Text style={styles.statusItemText}>{ingredients.length} ingredients</Text>
              </View>
            </View>
          </View>


          {/* Ingredients Section */}
          <View style={styles.ingredientsSection}>
            <View style={styles.ingredientsSectionHeader}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <TouchableOpacity onPress={addIngredient} style={styles.addButton}>
                <IconSymbol name="plus" size={18} color="#fff" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {ingredients.map((ing, index) => {
              const similarIngredients = !ing.posIngredientId && ing.name.length > 1
                ? getSimilarIngredients(ing.name)
                : [];
              const filteredIngredients = getFilteredIngredients(ing.searchQuery || '');

              const hasOpenDropdown = ing.showIngredientDropdown || ing.showUnitDropdown;
              return (
                <View
                  key={index}
                  style={[
                    styles.ingredientCard,
                    hasOpenDropdown && { zIndex: 1000 - index, elevation: 10 }
                  ]}
                >
                  <View style={styles.ingredientCardHeader}>
                    <View style={styles.ingredientBadges}>
                      <View
                        style={[
                          styles.ingredientStatusBadge,
                          { backgroundColor: ing.posIngredientId ? '#e8f5e9' : '#ffebee' },
                        ]}
                      >
                        <IconSymbol
                          name={ing.posIngredientId ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
                          size={14}
                          color={ing.posIngredientId ? '#4caf50' : '#f44336'}
                        />
                        <Text
                          style={[
                            styles.ingredientStatusText,
                            { color: ing.posIngredientId ? '#2e7d32' : '#c62828' },
                          ]}
                        >
                          {ing.posIngredientId ? 'Matched' : 'Unmatched'}
                        </Text>
                      </View>
                      {ing.unitUnclear && (
                        <View style={[styles.ingredientStatusBadge, { backgroundColor: '#fff3e0' }]}>
                          <IconSymbol name="questionmark.circle.fill" size={14} color="#ff9800" />
                          <Text style={[styles.ingredientStatusText, { color: '#e65100' }]}>
                            Unit Unclear
                          </Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => removeIngredient(index)}>
                      <IconSymbol name="xmark.circle.fill" size={24} color="#ff5252" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.ingredientInputs}>
                    {/* Ingredient Name with Dropdown */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Ingredient</Text>
                      <TouchableOpacity
                        style={[
                          styles.dropdownTrigger,
                          ing.posIngredientId && styles.dropdownTriggerMatched,
                          ing.showIngredientDropdown && styles.dropdownTriggerActive,
                        ]}
                        onPress={() => updateIngredient(index, 'showIngredientDropdown', !ing.showIngredientDropdown)}
                      >
                        <TextInput
                          style={styles.dropdownInput}
                          value={ing.searchQuery || ing.name}
                          onChangeText={(text) => updateIngredient(index, 'searchQuery', text)}
                          placeholder="Search or select ingredient..."
                          placeholderTextColor="#999"
                          onFocus={() => updateIngredient(index, 'showIngredientDropdown', true)}
                        />
                        <IconSymbol
                          name={ing.showIngredientDropdown ? 'chevron.up' : 'chevron.down'}
                          size={16}
                          color="#666"
                        />
                      </TouchableOpacity>

                      {/* Ingredient Dropdown */}
                      {ing.showIngredientDropdown && (
                        <View style={styles.dropdown}>
                          <ScrollView
                            style={styles.dropdownList}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                          >
                            {filteredIngredients.length > 0 ? (
                              filteredIngredients.map((item) => (
                                <TouchableOpacity
                                  key={item.id}
                                  style={styles.dropdownItem}
                                  onPress={() => selectIngredient(index, item)}
                                >
                                  <IconSymbol name="cube.fill" size={16} color="#2196f3" />
                                  <View style={styles.dropdownItemContent}>
                                    <Text style={styles.dropdownItemText}>{item.name}</Text>
                                    {item.aliases && item.aliases.length > 0 && (
                                      <Text style={styles.dropdownItemAliases}>
                                        Also: {item.aliases.slice(0, 2).join(', ')}
                                      </Text>
                                    )}
                                  </View>
                                  <Text style={styles.dropdownItemUnit}>{item.unit}</Text>
                                </TouchableOpacity>
                              ))
                            ) : (
                              <View style={styles.dropdownEmpty}>
                                <Text style={styles.dropdownEmptyText}>No ingredients found</Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      )}
                    </View>

                    {/* Similar Ingredients Suggestions (when unmatched) */}
                    {!ing.posIngredientId && similarIngredients.length > 0 && !ing.showIngredientDropdown && (
                      <View style={styles.suggestionsContainer}>
                        <Text style={styles.suggestionsTitle}>Did you mean?</Text>
                        <View style={styles.suggestionsList}>
                          {similarIngredients.slice(0, 3).map((suggestion) => (
                            <TouchableOpacity
                              key={suggestion.ingredient.id}
                              style={styles.suggestionChip}
                              onPress={() => selectIngredient(index, suggestion.ingredient)}
                            >
                              <Text style={styles.suggestionChipText}>
                                {suggestion.ingredient.name}
                              </Text>
                              <Text style={styles.suggestionChipPercent}>
                                {Math.round(suggestion.similarity * 100)}%
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Quick Add Button (when unmatched and no good suggestions) */}
                    {!ing.posIngredientId && ing.name.length > 0 && (
                      <TouchableOpacity
                        style={styles.quickAddButton}
                        onPress={() => openQuickAddModal(index)}
                      >
                        <IconSymbol name="plus.circle.fill" size={18} color="#4caf50" />
                        <Text style={styles.quickAddButtonText}>
                          Quick Add "{ing.name}" to Inventory
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Quantity and Unit Row */}
                    <View style={styles.row}>
                      {/* Quantity Input */}
                      <View style={styles.quantityContainer}>
                        <Text style={styles.inputLabel}>Quantity</Text>
                        <TextInput
                          style={styles.quantityInput}
                          value={ing.quantity > 0 ? ing.quantity.toString() : ''}
                          onChangeText={(text) => {
                            const parsed = parseFloat(text);
                            updateIngredient(index, 'quantity', isNaN(parsed) ? 0 : parsed);
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor="#999"
                        />
                      </View>

                      {/* Unit Dropdown */}
                      <View style={styles.unitContainer}>
                        <Text style={styles.inputLabel}>
                          Unit {ing.unitUnclear && ing.originalUnit && `(was: "${ing.originalUnit}")`}
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.unitDropdownTrigger,
                            ing.showUnitDropdown && styles.dropdownTriggerActive,
                          ]}
                          onPress={() => updateIngredient(index, 'showUnitDropdown', !ing.showUnitDropdown)}
                        >
                          <Text style={[styles.unitDropdownText, !ing.unit && styles.unitDropdownPlaceholder]}>
                            {ing.unit || 'Select'}
                          </Text>
                          <IconSymbol
                            name={ing.showUnitDropdown ? 'chevron.up' : 'chevron.down'}
                            size={14}
                            color="#666"
                          />
                        </TouchableOpacity>

                        {/* Unit Dropdown */}
                        {ing.showUnitDropdown && (
                          <View style={styles.unitDropdown}>
                            <ScrollView
                              style={styles.unitDropdownList}
                              keyboardShouldPersistTaps="handled"
                              nestedScrollEnabled
                            >
                              {UNITS.map((item) => (
                                <TouchableOpacity
                                  key={item}
                                  style={[
                                    styles.unitDropdownItem,
                                    ing.unit === item && styles.unitDropdownItemSelected,
                                  ]}
                                  onPress={() => selectUnit(index, item)}
                                >
                                  <Text
                                    style={[
                                      styles.unitDropdownItemText,
                                      ing.unit === item && styles.unitDropdownItemTextSelected,
                                    ]}
                                  >
                                    {item}
                                  </Text>
                                  {ing.unit === item && (
                                    <IconSymbol name="checkmark" size={14} color="#2196f3" />
                                  )}
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Inline Issues for this ingredient */}
                  {issues.filter(issue => issue.ingredientName?.toLowerCase() === ing.name.toLowerCase()).map((issue, issueIndex) => (
                    <View
                      key={issueIndex}
                      style={[
                        styles.inlineIssue,
                        {
                          backgroundColor:
                            issue.type === 'unit_unclear' ? '#fff3e0' :
                            issue.type === 'ingredient_not_found' ? '#ffebee' :
                            issue.type === 'similar_ingredient' ? '#e3f2fd' :
                            issue.type === 'duplicate_ingredient' ? '#f3e5f5' : '#f5f5f5',
                          borderLeftColor:
                            issue.type === 'unit_unclear' ? '#ff9800' :
                            issue.type === 'ingredient_not_found' ? '#f44336' :
                            issue.type === 'similar_ingredient' ? '#2196f3' :
                            issue.type === 'duplicate_ingredient' ? '#9c27b0' : '#666',
                        },
                      ]}
                    >
                      <View style={styles.inlineIssueHeader}>
                        <IconSymbol
                          name={
                            issue.type === 'unit_unclear' ? 'questionmark.circle.fill' :
                            issue.type === 'ingredient_not_found' ? 'exclamationmark.circle.fill' :
                            issue.type === 'similar_ingredient' ? 'arrow.triangle.2.circlepath' :
                            issue.type === 'duplicate_ingredient' ? 'doc.on.doc.fill' : 'exclamationmark.circle.fill'
                          }
                          size={14}
                          color={
                            issue.type === 'unit_unclear' ? '#ff9800' :
                            issue.type === 'ingredient_not_found' ? '#f44336' :
                            issue.type === 'similar_ingredient' ? '#2196f3' :
                            issue.type === 'duplicate_ingredient' ? '#9c27b0' : '#666'
                          }
                        />
                        <Text style={[
                          styles.inlineIssueType,
                          {
                            color:
                              issue.type === 'unit_unclear' ? '#e65100' :
                              issue.type === 'ingredient_not_found' ? '#c62828' :
                              issue.type === 'similar_ingredient' ? '#1565c0' :
                              issue.type === 'duplicate_ingredient' ? '#7b1fa2' : '#666',
                          }
                        ]}>
                          {issue.type === 'unit_unclear' ? 'Unit Unclear' :
                           issue.type === 'ingredient_not_found' ? 'Not in Inventory' :
                           issue.type === 'similar_ingredient' ? 'Verify Match' :
                           issue.type === 'duplicate_ingredient' ? 'Duplicate Found' : 'Issue'}
                        </Text>
                      </View>
                      <Text style={styles.inlineIssueMessage}>{issue.message}</Text>
                      {issue.suggestedFix && (
                        <Text style={styles.inlineIssueFix}>💡 {issue.suggestedFix}</Text>
                      )}
                      {/* Merge button for duplicate ingredients */}
                      {issue.type === 'duplicate_ingredient' && issue.duplicateIndices && (
                        <View style={styles.inlineIssueActions}>
                          <TouchableOpacity
                            style={styles.mergeButton}
                            onPress={() => mergeDuplicates(issue.ingredientName!, issue.duplicateIndices!)}
                          >
                            <IconSymbol name="arrow.triangle.merge" size={14} color="#fff" />
                            <Text style={styles.mergeButtonText}>Merge Quantities</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.keepSeparateButton}
                            onPress={() => {
                              // Remove the duplicate issue - user wants to keep them separate
                              setIssues(prevIssues => prevIssues.filter(i =>
                                !(i.type === 'duplicate_ingredient' && i.ingredientName?.toLowerCase() === issue.ingredientName?.toLowerCase())
                              ));
                            }}
                          >
                            <Text style={styles.keepSeparateButtonText}>Keep Separate</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}

            {ingredients.length === 0 && (
              <View style={styles.emptyIngredients}>
                <IconSymbol name="list.bullet" size={40} color="#ccc" />
                <Text style={styles.emptyIngredientsText}>No ingredients added yet</Text>
                <TouchableOpacity onPress={addIngredient} style={styles.emptyAddButton}>
                  <Text style={styles.emptyAddButtonText}>Add First Ingredient</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.draftButton} onPress={handleSaveRecipe} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="doc.fill" size={20} color="#fff" />
                  <Text style={styles.draftButtonText}>Save as Draft</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.importButton, !isReadyForExport && styles.importButtonDisabled]}
              onPress={handleExportToSquare}
              disabled={!isReadyForExport || exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="square.and.arrow.up" size={20} color={isReadyForExport ? '#fff' : '#999'} />
                  <Text style={[styles.importButtonText, !isReadyForExport && styles.importButtonTextDisabled]}>
                    Import to Square
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Quick Add Ingredient Modal */}
      <Modal visible={showQuickAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Inventory</Text>
              <TouchableOpacity onPress={() => setShowQuickAddModal(false)}>
                <IconSymbol name="xmark" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalDescription}>
                This ingredient will be added to your inventory and linked to this recipe.
              </Text>

              <Text style={styles.modalLabel}>Ingredient Name *</Text>
              <TextInput
                style={styles.modalInput}
                value={quickAddName}
                onChangeText={setQuickAddName}
                placeholder="e.g., All-Purpose Flour"
                placeholderTextColor="#999"
              />

              <Text style={styles.modalLabel}>Unit *</Text>
              <View style={styles.modalUnitGrid}>
                {UNITS.map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.modalUnitChip,
                      quickAddUnit === unit && styles.modalUnitChipSelected,
                    ]}
                    onPress={() => setQuickAddUnit(unit)}
                  >
                    <Text
                      style={[
                        styles.modalUnitChipText,
                        quickAddUnit === unit && styles.modalUnitChipTextSelected,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Aliases (comma-separated)</Text>
              <TextInput
                style={styles.modalInput}
                value={quickAddAliases}
                onChangeText={setQuickAddAliases}
                placeholder="e.g., AP Flour, Flour"
                placeholderTextColor="#999"
              />
              <Text style={styles.modalHint}>
                Add alternative names to help with future recipe matching
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowQuickAddModal(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleQuickAdd}
                disabled={quickAddSaving}
              >
                {quickAddSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Add to Inventory</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
  },
  headerDeleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  sourcePreview: {
    backgroundColor: '#fff',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e8eaed',
  },
  sourceImage: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
  },
  sourceLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  scrollView: {
    flex: 1,
  },
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
  statusCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusItemText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  issuesCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffe0b2',
  },
  issuesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  issuesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e65100',
  },
  issueItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  issueItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  issueItemIngredient: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  issueItemMessage: {
    fontSize: 13,
    color: '#666',
    marginLeft: 24,
    marginBottom: 4,
  },
  issueItemFix: {
    fontSize: 12,
    color: '#4caf50',
    marginLeft: 24,
    fontStyle: 'italic',
  },
  inlineIssue: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  inlineIssueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  inlineIssueType: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inlineIssueMessage: {
    fontSize: 13,
    color: '#555',
    marginLeft: 20,
    lineHeight: 18,
  },
  inlineIssueFix: {
    fontSize: 12,
    color: '#2e7d32',
    marginLeft: 20,
    marginTop: 4,
  },
  inlineIssueActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginLeft: 20,
  },
  mergeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#9c27b0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  mergeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  keepSeparateButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  keepSeparateButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
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
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
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
    zIndex: 1,
  },
  ingredientCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  ingredientBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  ingredientStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  ingredientStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ingredientInputs: {
    gap: 14,
  },
  inputContainer: {
    position: 'relative',
    zIndex: 100,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  dropdownTriggerMatched: {
    borderColor: '#4caf50',
    backgroundColor: '#f1f8f4',
  },
  dropdownTriggerActive: {
    borderColor: '#2196f3',
  },
  dropdownInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#e8eaed',
    zIndex: 9999,
  },
  dropdownList: {
    maxHeight: 220,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f7fa',
  },
  dropdownItemContent: {
    flex: 1,
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  dropdownItemAliases: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  dropdownItemUnit: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dropdownEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: '#999',
  },
  suggestionsContainer: {
    backgroundColor: '#fff8e1',
    borderRadius: 10,
    padding: 12,
    marginTop: -6,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f57c00',
    marginBottom: 8,
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffcc80',
    gap: 6,
  },
  suggestionChipText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  suggestionChipPercent: {
    fontSize: 11,
    color: '#999',
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    marginTop: -6,
  },
  quickAddButtonText: {
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '600',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    zIndex: 50,
  },
  quantityContainer: {
    flex: 1,
  },
  unitContainer: {
    flex: 1,
    position: 'relative',
    zIndex: 50,
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
  unitDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  unitDropdownText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  unitDropdownPlaceholder: {
    color: '#999',
  },
  unitDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#e8eaed',
    zIndex: 9999,
  },
  unitDropdownList: {
    maxHeight: 200,
  },
  unitDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f7fa',
  },
  unitDropdownItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  unitDropdownItemText: {
    fontSize: 15,
    color: '#1a1a1a',
  },
  unitDropdownItemTextSelected: {
    color: '#2196f3',
    fontWeight: '600',
  },
  emptyIngredients: {
    alignItems: 'center',
    padding: 40,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  emptyIngredientsText: {
    fontSize: 15,
    color: '#999',
    marginTop: 12,
  },
  emptyAddButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2196f3',
    borderRadius: 20,
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e8eaed',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  draftButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#607d8b',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  draftButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  importButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  importButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  importButtonTextDisabled: {
    color: '#999',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e8eaed',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalBody: {
    padding: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  modalInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  modalHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  modalUnitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalUnitChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalUnitChipSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  modalUnitChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  modalUnitChipTextSelected: {
    color: '#2196f3',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e8eaed',
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalSaveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4caf50',
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
