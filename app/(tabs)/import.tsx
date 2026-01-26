import { TopBar } from '@/components/TopBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { recipeRepository } from '@/database/repositories/recipe.repository';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import { importRecipeFromImage } from '@/services/api/recipe-import.api';
import type { Recipe } from '@/types/recipe';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ImportScreen() {
  const router = useRouter();
  const { ingredients: posIngredients } = usePOSIngredients();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'camera' | 'pdf' | 'excel' | 'text'>(
    'camera'
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        processImage(result.assets[0].uri);
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
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        processImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image. Please try again.');
      console.error('Image picker error:', error);
    }
  };

  const processImage = async (imageUri: string) => {
    setIsProcessing(true);
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
        await recipeRepository.saveRecipe(result.recipe);
      } else {
        // Use mock data (current behavior)
        await simulateProgress('Extracting text from image...', 30);

        setProgressMessage('Parsing recipe with AI...');
        await simulateProgress('Parsing recipe with AI...', 70);

        setProgressMessage('Validating recipe data...');
        await simulateProgress('Validating recipe data...', 100);

        setProgressMessage('Saving to database...');

        const now = new Date();
        const recipeId = `recipe_${Date.now()}`;

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

        await recipeRepository.saveRecipe(mockRecipe);
      }

      setProgressMessage('Recipe import complete!');

      setTimeout(() => {
        setIsProcessing(false);
        setSelectedImage(null);
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
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('Error', 'Failed to process recipe. Please try again.');
      console.error('Processing error:', error);
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
    Alert.alert(
      'Coming Soon',
      'PDF import will be available in the next update. Use camera or text for now.'
    );
  };

  const handleExcelImport = async () => {
    Alert.alert(
      'Coming Soon',
      'Excel import will be available in the next update. Use camera or text for now.'
    );
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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar />

      <View style={styles.content}>
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
              {renderImportMethod('camera', 'camera.fill', 'Camera', () => setSelectedMethod('camera'))}
              {renderImportMethod('pdf', 'doc.fill', 'PDF', handlePDFImport)}
              {renderImportMethod('excel', 'tablecells.fill', 'Excel', handleExcelImport)}
              {renderImportMethod('text', 'text.alignleft', 'Text', handleTextImport)}
            </View>

            {/* Camera Upload Area */}
            {selectedMethod === 'camera' && (
              <View style={styles.uploadArea}>
                <IconSymbol name="camera" size={64} color="#ccc" />
                <Text style={styles.uploadText}>Take a photo or select from gallery</Text>
                <Text style={styles.uploadHint}>Tap to capture</Text>

                <TouchableOpacity style={styles.uploadButton} onPress={handleTakePhoto}>
                  <IconSymbol name="camera.fill" size={20} color="#fff" />
                  <Text style={styles.uploadButtonText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryButton} onPress={handleSelectFromGallery}>
                  <IconSymbol name="photo.fill" size={20} color="#2196f3" />
                  <Text style={styles.secondaryButtonText}>Select from Gallery</Text>
                </TouchableOpacity>
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
            <Text style={styles.processingTitle}>Processing Recipe</Text>
            <Text style={styles.processingMessage}>{progressMessage}</Text>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>

            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        )}
      </View>
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
    paddingHorizontal: 16,
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
