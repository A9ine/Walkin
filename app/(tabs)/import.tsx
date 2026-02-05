import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { recipeRepository } from '@/database/repositories/recipe.repository';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import { importRecipeFromImage } from '@/services/api/recipe-import.api';
import type { Recipe } from '@/types/recipe';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';

interface SelectedImage {
  uri: string;
  base64?: string;
}

export default function ImportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { ingredients: posIngredients } = usePOSIngredients();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'camera' | 'pdf' | 'excel' | 'text'>(
    'camera'
  );
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(0);
  const [useRealAPI, setUseRealAPI] = useState(false);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Camera permission is required to take photos of recipes.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const requestMediaLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Photo library permission is required to select images.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        // Add to selected images instead of processing immediately
        setSelectedImages(prev => [...prev, {
          uri: result.assets[0].uri,
          base64: result.assets[0].base64 || undefined,
        }]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
      console.error('Camera error:', error);
    }
  };

  const handleSelectFromGallery = async () => {
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        allowsMultipleSelection: true, // Enable multi-select
        selectionLimit: 10, // Max 10 images at once
        base64: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const images: SelectedImage[] = result.assets.map(asset => ({
          uri: asset.uri,
          base64: asset.base64 || undefined,
        }));
        setSelectedImages(images);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select images. Please try again.');
      console.error('Image picker error:', error);
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAllImages = () => {
    setSelectedImages([]);
  };

  const handleProcessAllImages = async () => {
    if (selectedImages.length === 0) return;

    setIsProcessing(true);
    setCurrentProcessingIndex(0);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      setCurrentProcessingIndex(i);
      setProgress(0);
      setProgressMessage(`Processing image ${i + 1} of ${selectedImages.length}...`);

      try {
        await processImage(selectedImages[i].uri, selectedImages[i].base64, true);
        successCount++;
      } catch (error) {
        console.error(`Failed to process image ${i + 1}:`, error);
        failCount++;
      }
    }

    setIsProcessing(false);
    setSelectedImages([]);

    const message = failCount > 0
      ? `${successCount} recipe(s) imported successfully. ${failCount} failed.`
      : `${successCount} recipe(s) imported successfully!`;

    Alert.alert('Import Complete', message, [
      {
        text: 'View Inbox',
        onPress: () => router.push('/(tabs)/inbox'),
      },
      {
        text: 'Import More',
        style: 'cancel',
      },
    ]);
  };

  const processImage = async (imageUri: string, base64Data?: string | null, batchMode: boolean = false) => {
    if (!batchMode) {
      setIsProcessing(true);
    }
    setProgress(0);
    setProgressMessage('Extracting text from image...');

    try {
      // Check if API keys are configured
      const hasAPIKeys =
        process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY && process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;

      if (hasAPIKeys && useRealAPI) {
        // Use real OCR + Claude API
        const result = await importRecipeFromImage(imageUri, posIngredients, (progressData) => {
          setProgress(progressData.progress);
          setProgressMessage(progressData.message);
        });

        if (!result.success || !result.recipe) {
          throw new Error(result.error || 'Failed to import recipe');
        }

        setProgressMessage('Saving to database...');
        if (!user?.uid) throw new Error('User not authenticated');
        await recipeRepository.saveRecipe(result.recipe, user.uid);
      } else {
        // Use mock data (current behavior)
        await simulateProgress('Extracting text from image...', 30);

        setProgressMessage('Parsing recipe with AI...');
        await simulateProgress('Parsing recipe with AI...', 70);

        setProgressMessage('Validating recipe data...');
        await simulateProgress('Validating recipe data...', 100);

        setProgressMessage('Saving to database...');

        const now = new Date();
        const recipeId = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const mockRecipe: Recipe = {
          id: recipeId,
          name: 'Chocolate Chip Cookie',
          status: 'ready_to_import',
          confidence: 'high',
          lastUpdated: now,
          createdAt: now,
          source: {
            type: 'photo',
            uri: imageUri,
            uploadedAt: now,
          },
          ingredients: [
            { name: 'All-Purpose Flour', quantity: 2.25, unit: 'cup', posIngredientId: 'ing_2', isNew: false },
            { name: 'Butter', quantity: 1, unit: 'cup', posIngredientId: 'ing_4', isNew: false },
            { name: 'Granulated Sugar', quantity: 0.75, unit: 'cup', posIngredientId: 'ing_3', isNew: false },
            { name: 'Large Eggs', quantity: 2, unit: 'each', posIngredientId: 'ing_5', isNew: false },
            { name: 'Vanilla Extract', quantity: 2, unit: 'tsp', posIngredientId: 'ing_6', isNew: false },
            { name: 'Baking Soda', quantity: 1, unit: 'tsp', posIngredientId: 'ing_8', isNew: false },
            { name: 'Salt', quantity: 1, unit: 'tsp', posIngredientId: 'ing_9', isNew: false },
            { name: 'Chocolate Chips', quantity: 2, unit: 'cup', posIngredientId: 'ing_7', isNew: false },
          ],
          issues: [],
        };

        if (!user?.uid) throw new Error('User not authenticated');
        await recipeRepository.saveRecipe(mockRecipe, user.uid);
      }

      setProgressMessage('Recipe import complete!');

      // Only show alert and reset state if not in batch mode
      if (!batchMode) {
        setTimeout(() => {
          setIsProcessing(false);
          setSelectedImages([]);
          Alert.alert('Success!', 'Recipe has been imported to your inbox.', [
            {
              text: 'View Inbox',
              onPress: () => router.push('/(tabs)/inbox'),
            },
            {
              text: 'Import Another',
              style: 'cancel',
            },
          ]);
        }, 1000);
      }
    } catch (error: any) {
      if (!batchMode) {
        setIsProcessing(false);
        const errorMessage = error?.message || 'Unknown error';
        Alert.alert('Error', `Failed to process recipe: ${errorMessage}`);
      }
      console.error('Processing error:', error);
      throw error; // Re-throw for batch mode to catch
    }
  };

  const simulateProgress = async (message: string, targetProgress: number) => {
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= targetProgress) {
            clearInterval(interval);
            resolve();
            return targetProgress;
          }
          return prev + 2;
        });
      }, 50);
    });
  };

  const handlePDFImport = async () => {
    try {
      console.log('Opening PDF picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all files, we'll check extension
        copyToCacheDirectory: true,
        multiple: false,
      });

      console.log('PDF picker result:', JSON.stringify(result, null, 2));

      if (result.canceled) {
        console.log('PDF selection canceled');
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        console.log('No assets in result');
        Alert.alert('Error', 'No file selected');
        return;
      }

      const file = result.assets[0];
      console.log('Selected file:', file.name, file.uri, file.mimeType);

      // Check if it's a PDF
      const fileName = file.name?.toLowerCase() || '';
      const mimeType = file.mimeType?.toLowerCase() || '';

      if (!fileName.endsWith('.pdf') && !mimeType.includes('pdf')) {
        Alert.alert('Invalid File', 'Please select a PDF file.');
        return;
      }

      processPDF(file.uri, file.name || 'recipe.pdf');
    } catch (error: any) {
      console.error('PDF picker error:', error);
      Alert.alert('Error', `Failed to select PDF file: ${error?.message || 'Unknown error'}`);
    }
  };

  const processPDF = async (fileUri: string, fileName: string) => {
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Reading PDF file...');

    try {
      await simulateProgress('Reading PDF file...', 30);

      setProgressMessage('Extracting text from PDF...');
      await simulateProgress('Extracting text from PDF...', 60);

      setProgressMessage('Parsing recipe with AI...');
      await simulateProgress('Parsing recipe with AI...', 90);

      setProgressMessage('Saving to database...');

      const now = new Date();
      const recipeId = `recipe_${Date.now()}`;
      const recipeName = fileName.replace('.pdf', '').replace(/_/g, ' ');

      const mockRecipe: Recipe = {
        id: recipeId,
        name: recipeName || 'Imported PDF Recipe',
        status: 'needs_review',
        confidence: 'medium',
        lastUpdated: now,
        createdAt: now,
        source: {
          type: 'pdf',
          uri: fileUri,
          uploadedAt: now,
        },
        ingredients: [
          { name: 'Flour', quantity: 2, unit: 'cup', isNew: true },
          { name: 'Sugar', quantity: 1, unit: 'cup', isNew: true },
          { name: 'Butter', quantity: 0.5, unit: 'cup', isNew: true },
          { name: 'Eggs', quantity: 2, unit: 'each', isNew: true },
        ],
        issues: [
          {
            type: 'ingredient_not_found',
            ingredientName: 'Flour',
            message: 'Could not find matching ingredient in inventory',
          },
        ],
      };

      if (!user?.uid) throw new Error('User not authenticated');
      await recipeRepository.saveRecipe(mockRecipe, user.uid);
      setProgress(100);
      setProgressMessage('Recipe import complete!');

      setTimeout(() => {
        setIsProcessing(false);
        Alert.alert('Success!', 'PDF recipe has been imported to your inbox.', [
          {
            text: 'View Inbox',
            onPress: () => router.push('/(tabs)/inbox'),
          },
          {
            text: 'Import Another',
            style: 'cancel',
          },
        ]);
      }, 1000);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('Error', 'Failed to process PDF. Please try again.');
      console.error('PDF processing error:', error);
    }
  };

  const handleExcelImport = async () => {
    try {
      console.log('Opening Excel picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all files, we'll check extension
        copyToCacheDirectory: true,
        multiple: false,
      });

      console.log('Excel picker result:', JSON.stringify(result, null, 2));

      if (result.canceled) {
        console.log('Excel selection canceled');
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        console.log('No assets in result');
        Alert.alert('Error', 'No file selected');
        return;
      }

      const file = result.assets[0];
      console.log('Selected file:', file.name, file.uri, file.mimeType);

      // Check if it's an Excel/CSV file
      const fileName = file.name?.toLowerCase() || '';
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));

      if (!isValidFile) {
        Alert.alert('Invalid File', 'Please select an Excel (.xlsx, .xls) or CSV file.');
        return;
      }

      processExcel(file.uri, file.name || 'recipe.xlsx');
    } catch (error: any) {
      console.error('Excel picker error:', error);
      Alert.alert('Error', `Failed to select Excel file: ${error?.message || 'Unknown error'}`);
    }
  };

  const processExcel = async (fileUri: string, fileName: string) => {
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Reading Excel file...');

    try {
      await simulateProgress('Reading Excel file...', 20);

      // Read the file
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setProgressMessage('Parsing spreadsheet data...');
      await simulateProgress('Parsing spreadsheet data...', 50);

      // Parse Excel file
      const workbook = XLSX.read(fileContent, { type: 'base64' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      setProgressMessage('Extracting ingredients...');
      await simulateProgress('Extracting ingredients...', 80);

      // Try to extract ingredients from the spreadsheet
      const ingredients = parseIngredientsFromExcel(jsonData);

      setProgressMessage('Saving to database...');

      const now = new Date();
      const recipeId = `recipe_${Date.now()}`;
      const recipeName = fileName.replace(/\.(xlsx|xls|csv)$/i, '').replace(/_/g, ' ');

      const recipe: Recipe = {
        id: recipeId,
        name: recipeName || 'Imported Excel Recipe',
        status: ingredients.some(ing => !ing.posIngredientId) ? 'needs_review' : 'ready_to_import',
        confidence: ingredients.length > 0 ? 'medium' : 'low',
        lastUpdated: now,
        createdAt: now,
        source: {
          type: 'excel',
          uri: fileUri,
          uploadedAt: now,
        },
        ingredients,
        issues: ingredients
          .filter(ing => !ing.posIngredientId)
          .map(ing => ({
            type: 'ingredient_not_found' as const,
            ingredientName: ing.name,
            message: 'Could not find matching ingredient in inventory',
          })),
      };

      if (!user?.uid) throw new Error('User not authenticated');
      await recipeRepository.saveRecipe(recipe, user.uid);
      setProgress(100);
      setProgressMessage('Recipe import complete!');

      setTimeout(() => {
        setIsProcessing(false);
        Alert.alert(
          'Success!',
          `Excel recipe imported with ${ingredients.length} ingredients.`,
          [
            {
              text: 'View Inbox',
              onPress: () => router.push('/(tabs)/inbox'),
            },
            {
              text: 'Import Another',
              style: 'cancel',
            },
          ]
        );
      }, 1000);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('Error', 'Failed to process Excel file. Please try again.');
      console.error('Excel processing error:', error);
    }
  };

  const parseIngredientsFromExcel = (data: any[][]): Recipe['ingredients'] => {
    const ingredients: Recipe['ingredients'] = [];

    // Skip header row if it looks like headers
    const startRow = data[0]?.some((cell: any) =>
      typeof cell === 'string' &&
      ['ingredient', 'name', 'item', 'qty', 'quantity', 'unit'].includes(cell.toLowerCase())
    ) ? 1 : 0;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      // Try to identify columns
      let name = '';
      let quantity = 0;
      let unit = 'each';

      if (row.length >= 3) {
        // Assume format: Name, Quantity, Unit
        name = String(row[0] || '').trim();
        quantity = parseFloat(row[1]) || 0;
        unit = String(row[2] || 'each').trim();
      } else if (row.length === 2) {
        // Assume format: Name, Quantity
        name = String(row[0] || '').trim();
        quantity = parseFloat(row[1]) || 1;
      } else if (row.length === 1) {
        // Just name
        name = String(row[0] || '').trim();
        quantity = 1;
      }

      if (name) {
        // Try to match with POS ingredients
        const matchedIngredient = posIngredients.find(
          pos => pos.name.toLowerCase() === name.toLowerCase() ||
                 pos.aliases?.some(alias => alias.toLowerCase() === name.toLowerCase())
        );

        ingredients.push({
          name,
          quantity,
          unit,
          posIngredientId: matchedIngredient?.id,
          isNew: !matchedIngredient,
        });
      }
    }

    return ingredients;
  };

  const handleTextImport = () => {
    router.push('/(tabs)/text-import');
  };

  const renderImportMethod = (
    method: typeof selectedMethod,
    icon: string,
    label: string,
    onPress: () => void
  ) => {
    const isSelected = selectedMethod === method;

    return (
      <TouchableOpacity
        style={[styles.methodButton, isSelected && styles.selectedMethod]}
        onPress={() => {
          setSelectedMethod(method);
          onPress();
        }}
      >
        <IconSymbol name={icon} size={48} color={isSelected ? '#2196f3' : '#666'} />
        <Text style={[styles.methodLabel, isSelected && styles.selectedMethodLabel]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Import Recipe</Text>
            <Text style={styles.subtitle}>Upload or capture your recipe to parse it automatically</Text>
          </View>

          <TouchableOpacity
            style={[styles.apiToggle, useRealAPI && styles.apiToggleActive]}
            onPress={() => setUseRealAPI(!useRealAPI)}
          >
            <IconSymbol
              name={useRealAPI ? 'bolt.fill' : 'bolt.slash.fill'}
              size={16}
              color={useRealAPI ? '#fff' : '#666'}
            />
            <Text style={[styles.apiToggleText, useRealAPI && styles.apiToggleTextActive]}>
              {useRealAPI ? 'Live API' : 'Mock Mode'}
            </Text>
          </TouchableOpacity>
        </View>

        {!isProcessing ? (
          <>
            {/* Import Methods */}
            <View style={styles.methodsGrid}>
              {renderImportMethod('camera', 'camera.fill', 'Camera', () => {})}
              {renderImportMethod('pdf', 'doc.fill', 'PDF', () => {})}
              {renderImportMethod('excel', 'tablecells.fill', 'Excel', () => {})}
              {renderImportMethod('text', 'text.alignleft', 'Text', () => {})}
            </View>

            {/* Camera Upload Area */}
            {selectedMethod === 'camera' && (
              <View style={styles.uploadArea}>
                {selectedImages.length === 0 ? (
                  <>
                    <IconSymbol name="camera" size={64} color="#ccc" />
                    <Text style={styles.uploadText}>Take photos or select from gallery</Text>
                    <Text style={styles.uploadHint}>You can select multiple images at once</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.selectedImagesHeader}>
                      <Text style={styles.selectedImagesTitle}>
                        {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
                      </Text>
                      <TouchableOpacity onPress={handleClearAllImages}>
                        <Text style={styles.clearAllText}>Clear All</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.selectedImagesGrid}>
                      {selectedImages.map((image, index) => (
                        <View key={index} style={styles.selectedImageContainer}>
                          <Image source={{ uri: image.uri }} style={styles.selectedImageThumb} />
                          <TouchableOpacity
                            style={styles.removeImageButton}
                            onPress={() => handleRemoveImage(index)}
                          >
                            <IconSymbol name="xmark.circle.fill" size={24} color="#ff5252" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <View style={styles.uploadButtonsRow}>
                  <TouchableOpacity style={styles.uploadButtonSmall} onPress={handleTakePhoto}>
                    <IconSymbol name="camera.fill" size={18} color="#fff" />
                    <Text style={styles.uploadButtonTextSmall}>Camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.uploadButtonSmall} onPress={handleSelectFromGallery}>
                    <IconSymbol name="photo.fill" size={18} color="#fff" />
                    <Text style={styles.uploadButtonTextSmall}>Gallery</Text>
                  </TouchableOpacity>
                </View>

                {selectedImages.length > 0 && (
                  <TouchableOpacity
                    style={styles.processAllButton}
                    onPress={handleProcessAllImages}
                  >
                    <IconSymbol name="arrow.right.circle.fill" size={22} color="#fff" />
                    <Text style={styles.processAllButtonText}>
                      Process {selectedImages.length} Recipe{selectedImages.length > 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {selectedMethod !== 'camera' && (
              <View style={styles.uploadArea}>
                <IconSymbol name="arrow.down.doc.fill" size={64} color="#ccc" />
                <Text style={styles.uploadText}>
                  {selectedMethod === 'pdf' && 'Upload a PDF file'}
                  {selectedMethod === 'excel' && 'Upload an Excel file'}
                  {selectedMethod === 'text' && 'Paste recipe text'}
                </Text>

                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={
                    selectedMethod === 'pdf'
                      ? handlePDFImport
                      : selectedMethod === 'excel'
                      ? handleExcelImport
                      : handleTextImport
                  }
                >
                  <IconSymbol name="doc.fill" size={20} color="#fff" />
                  <Text style={styles.uploadButtonText}>
                    {selectedMethod === 'text' ? 'Paste Text' : 'Choose File'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Tips */}
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>Tips for best results:</Text>
              <View style={styles.tipItem}>
                <IconSymbol name="checkmark.circle.fill" size={16} color="#4caf50" />
                <Text style={styles.tipText}>Ensure text is clear and well-lit</Text>
              </View>
              <View style={styles.tipItem}>
                <IconSymbol name="checkmark.circle.fill" size={16} color="#4caf50" />
                <Text style={styles.tipText}>Include ingredient names and quantities</Text>
              </View>
              <View style={styles.tipItem}>
                <IconSymbol name="checkmark.circle.fill" size={16} color="#4caf50" />
                <Text style={styles.tipText}>Specify units (cups, oz, tsp, etc.)</Text>
              </View>
            </View>
          </>
        ) : (
          /* Processing Screen */
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#2196f3" />
            <Text style={styles.processingTitle}>Processing Recipes</Text>

            {selectedImages.length > 1 && (
              <View style={styles.batchProgressContainer}>
                <Text style={styles.batchProgressText}>
                  Recipe {currentProcessingIndex + 1} of {selectedImages.length}
                </Text>
                <View style={styles.batchProgressDots}>
                  {selectedImages.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.batchProgressDot,
                        index < currentProcessingIndex && styles.batchProgressDotComplete,
                        index === currentProcessingIndex && styles.batchProgressDotCurrent,
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.processingMessage}>{progressMessage}</Text>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>

            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  header: {
    marginTop: 16,
    marginBottom: 8,
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
  apiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  apiToggleActive: {
    backgroundColor: '#2196f3',
  },
  apiToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  apiToggleTextActive: {
    color: '#fff',
  },
  methodsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  methodButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  selectedMethod: {
    borderColor: '#2196f3',
    backgroundColor: '#e3f2fd',
  },
  methodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
  },
  selectedMethodLabel: {
    color: '#2196f3',
  },
  uploadArea: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    marginTop: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e0e0e0',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    textAlign: 'center',
  },
  uploadHint: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196f3',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 24,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  secondaryButtonText: {
    color: '#2196f3',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedImagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  selectedImagesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  clearAllText: {
    fontSize: 14,
    color: '#f44336',
    fontWeight: '600',
  },
  selectedImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
    width: '100%',
    marginBottom: 16,
  },
  selectedImageContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'visible',
  },
  selectedImageThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  uploadButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  uploadButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196f3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  uploadButtonTextSmall: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  processAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    gap: 10,
  },
  processAllButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  batchProgressContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  batchProgressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  batchProgressDots: {
    flexDirection: 'row',
    gap: 6,
  },
  batchProgressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
  },
  batchProgressDotComplete: {
    backgroundColor: '#4caf50',
  },
  batchProgressDotCurrent: {
    backgroundColor: '#2196f3',
  },
  tipsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  tipText: {
    fontSize: 13,
    color: '#666',
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 24,
  },
  processingMessage: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginTop: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196f3',
  },
  progressText: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
  },
});
