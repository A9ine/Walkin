import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSquareAuth } from '@/contexts/SquareAuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { squareImportService, type ImportProgress } from '@/services/square/square-import.service';
import { IconSymbol } from '@/components/ui/icon-symbol';

type OnboardingStep = 'connect' | 'sync' | 'complete';

export default function SquareOnboardingScreen() {
  const { user, signOut } = useAuth();
  const { isSquareConnected, connectSquare, markInitialSyncComplete } = useSquareAuth();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    isSquareConnected ? 'sync' : 'connect'
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ImportProgress | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncResults, setSyncResults] = useState<{
    menuItems: number;
    inventory: number;
  } | null>(null);

  const handleConnectSquare = async () => {
    setIsConnecting(true);

    try {
      const result = await connectSquare();

      if (result.success) {
        setCurrentStep('sync');
      } else {
        Alert.alert('Connection Failed', result.error || 'Failed to connect to Square');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Square. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    setShowSyncModal(true);
    setSyncProgress(null);

    try {
      // Import menu items
      setSyncProgress({
        stage: 'fetching',
        message: 'Importing menu items...',
        current: 0,
        total: 100,
      });

      const menuResult = await squareImportService.importCatalog((progress) => {
        setSyncProgress({
          ...progress,
          message: `Importing menu items: ${progress.message}`,
          current: Math.min(progress.current * 0.5, 50),
          total: 100,
        });
      }, user?.uid);

      // Import inventory
      setSyncProgress({
        stage: 'fetching',
        message: 'Importing inventory...',
        current: 50,
        total: 100,
      });

      const inventoryResult = await squareImportService.importInventory((progress) => {
        setSyncProgress({
          ...progress,
          message: `Importing inventory: ${progress.message}`,
          current: 50 + Math.min(progress.current * 0.5, 50),
          total: 100,
        });
      }, user?.uid);

      setSyncProgress({
        stage: 'complete',
        message: 'Sync complete!',
        current: 100,
        total: 100,
      });

      setSyncResults({
        menuItems: menuResult.menuItemsImported,
        inventory: inventoryResult.ingredientsImported,
      });

      // Mark initial sync as complete
      await markInitialSyncComplete();
      setCurrentStep('complete');
    } catch (error) {
      Alert.alert('Sync Failed', 'Failed to sync data from Square. Please try again.');
      setShowSyncModal(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleContinueToApp = () => {
    setShowSyncModal(false);
    router.replace('/(tabs)/inbox');
  };

  const handleLogout = async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)');
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  };

  const renderSyncModal = () => (
    <Modal visible={showSyncModal} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.squareLogo}>
              <Text style={styles.squareLogoText}>SQ</Text>
            </View>
            <Text style={styles.modalTitle}>
              {currentStep === 'complete' ? 'Sync Complete!' : 'Syncing with Square'}
            </Text>
          </View>

          {syncProgress && currentStep !== 'complete' && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressMessage}>{syncProgress.message}</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(syncProgress.current / syncProgress.total) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressPercent}>
                {Math.round((syncProgress.current / syncProgress.total) * 100)}%
              </Text>
            </View>
          )}

          {currentStep === 'complete' && syncResults && (
            <View style={styles.resultsContainer}>
              <View style={styles.resultRow}>
                <IconSymbol name="menucard.fill" size={24} color="#2196f3" />
                <Text style={styles.resultText}>
                  {syncResults.menuItems} menu items imported
                </Text>
              </View>
              <View style={styles.resultRow}>
                <IconSymbol name="shippingbox.fill" size={24} color="#2196f3" />
                <Text style={styles.resultText}>
                  {syncResults.inventory} inventory items imported
                </Text>
              </View>

              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinueToApp}
              >
                <Text style={styles.continueButtonText}>Get Started</Text>
              </TouchableOpacity>
            </View>
          )}

          {isSyncing && currentStep !== 'complete' && (
            <ActivityIndicator size="large" color="#2196f3" style={{ marginTop: 20 }} />
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderSyncModal()}

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          <View style={styles.logoContainer}>
            <View style={styles.squareLogoBig}>
              <Text style={styles.squareLogoTextBig}>SQ</Text>
            </View>
          </View>

          <Text style={styles.title}>Connect to Square</Text>
          <Text style={styles.subtitle}>
            {currentStep === 'connect'
              ? 'To get started, please connect your Square account to sync your menu and inventory.'
              : 'Your Square account is connected. Now sync your data to begin using BubbleTea.'}
          </Text>

          {/* Steps Indicator */}
          <View style={styles.stepsContainer}>
            <View style={styles.stepRow}>
              <View
                style={[
                  styles.stepCircle,
                  (currentStep === 'sync' || currentStep === 'complete') && styles.stepCircleComplete,
                ]}
              >
                {currentStep === 'sync' || currentStep === 'complete' ? (
                  <IconSymbol name="checkmark" size={16} color="#fff" />
                ) : (
                  <Text style={styles.stepNumber}>1</Text>
                )}
              </View>
              <View style={styles.stepLine} />
              <View
                style={[
                  styles.stepCircle,
                  currentStep === 'complete' && styles.stepCircleComplete,
                  currentStep === 'sync' && styles.stepCircleActive,
                ]}
              >
                {currentStep === 'complete' ? (
                  <IconSymbol name="checkmark" size={16} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      currentStep === 'sync' && styles.stepNumberActive,
                    ]}
                  >
                    2
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.stepLabels}>
              <Text style={styles.stepLabel}>Connect</Text>
              <Text style={styles.stepLabel}>Sync Data</Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.buttonSection}>
          {currentStep === 'connect' ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleConnectSquare}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <View style={styles.squareLogoSmall}>
                    <Text style={styles.squareLogoTextSmall}>SQ</Text>
                  </View>
                  <Text style={styles.primaryButtonText}>Connect Square Account</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSyncData}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <IconSymbol name="arrow.triangle.2.circlepath" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Sync Menu & Inventory</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <Text style={styles.helperText}>
            We'll import your menu items and inventory from Square to help you manage recipes.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 8,
  },
  logoutButton: {
    padding: 8,
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  logoContainer: {
    marginBottom: 32,
  },
  squareLogoBig: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareLogoTextBig: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  stepsContainer: {
    width: '100%',
    maxWidth: 280,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#2196f3',
  },
  stepCircleComplete: {
    backgroundColor: '#4caf50',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 12,
    maxWidth: 100,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  stepLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  buttonSection: {
    paddingBottom: 40,
  },
  primaryButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  squareLogoSmall: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareLogoTextSmall: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  squareLogo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  squareLogoText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  progressContainer: {
    width: '100%',
  },
  progressMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196f3',
  },
  progressPercent: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  resultsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    width: '100%',
  },
  resultText: {
    fontSize: 16,
    color: '#333',
  },
  continueButton: {
    backgroundColor: '#4caf50',
    borderRadius: 12,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
