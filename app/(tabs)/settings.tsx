import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useSquareAuth } from '@/contexts/SquareAuthContext';
import { squareImportService, type ImportProgress } from '@/services/square/square-import.service';
import { squareExportService } from '@/services/square/square-export.service';
import { usePOSIngredients } from '@/hooks/database/usePOSIngredients';
import { useRecipes } from '@/hooks/database/useRecipes';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

type SyncType = 'import_menu' | 'import_inventory' | 'export_recipes' | 'export_inventory';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { isSquareConnected, merchantId, disconnectSquare, isLoading: squareLoading } = useSquareAuth();
  const { ingredients, loadIngredients } = usePOSIngredients();
  const { recipes } = useRecipes();

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ImportProgress | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncType, setSyncType] = useState<SyncType>('import_menu');

  const handleSyncNow = async () => {
    setSyncType('import_menu');
    setShowSyncModal(true);
    setIsSyncing(true);
    setSyncProgress(null);

    try {
      const result = await squareImportService.importCatalog((progress) => {
        setSyncProgress(progress);
      }, user?.uid);

      if (result.success) {
        setLastSyncedAt(new Date());
        Alert.alert(
          'Sync Complete!',
          `Imported ${result.menuItemsImported} menu items from Square.`,
          [{ text: 'OK', onPress: () => setShowSyncModal(false) }]
        );
      } else {
        Alert.alert('Sync Failed', result.error || 'Failed to sync with Square');
        setShowSyncModal(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync with Square. Please try again.');
      setShowSyncModal(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportInventory = async () => {
    setSyncType('import_inventory');
    setShowSyncModal(true);
    setIsSyncing(true);
    setSyncProgress(null);

    try {
      const result = await squareImportService.importInventory((progress) => {
        setSyncProgress(progress);
      }, user?.uid);

      if (result.success) {
        await loadIngredients();
        Alert.alert(
          'Import Complete!',
          `Imported ${result.ingredientsImported} inventory items from Square.`,
          [{ text: 'OK', onPress: () => setShowSyncModal(false) }]
        );
      } else {
        Alert.alert('Import Failed', result.error || 'Failed to import inventory');
        setShowSyncModal(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to import inventory. Please try again.');
      setShowSyncModal(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportRecipes = async () => {
    if (recipes.length === 0) {
      Alert.alert('No Recipes', 'You don\'t have any recipes to export.');
      return;
    }

    const readyRecipes = recipes.filter(r => r.status === 'ready_to_import');
    if (readyRecipes.length === 0) {
      Alert.alert(
        'No Ready Recipes',
        'No recipes are ready for export. Please ensure all ingredients are matched first.'
      );
      return;
    }

    Alert.alert(
      'Export Recipes',
      `Export ${readyRecipes.length} recipe(s) to Square as menu items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            setSyncType('export_recipes');
            setShowSyncModal(true);
            setIsSyncing(true);
            setSyncProgress(null);

            try {
              const result = await squareExportService.exportRecipes(
                readyRecipes,
                (current, total, name) => {
                  setSyncProgress({
                    stage: 'processing',
                    message: `Exporting ${name}...`,
                    current,
                    total,
                  });
                }
              );

              if (result.success) {
                Alert.alert(
                  'Export Complete!',
                  `Exported ${result.syncedCount} recipe(s) to Square.`,
                  [{ text: 'OK', onPress: () => setShowSyncModal(false) }]
                );
              } else {
                const errorMsg = result.errors.length > 0
                  ? `Exported ${result.syncedCount}. Errors:\n${result.errors.slice(0, 3).join('\n')}`
                  : 'Export failed';
                Alert.alert('Export Issues', errorMsg);
                setShowSyncModal(false);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to export recipes. Please try again.');
              setShowSyncModal(false);
            } finally {
              setIsSyncing(false);
            }
          },
        },
      ]
    );
  };

  const handleExportInventory = async () => {
    if (ingredients.length === 0) {
      Alert.alert('No Inventory', 'You don\'t have any inventory items to export.');
      return;
    }

    Alert.alert(
      'Export Inventory',
      `Export ${ingredients.length} inventory item(s) to Square?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            setSyncType('export_inventory');
            setShowSyncModal(true);
            setIsSyncing(true);
            setSyncProgress({
              stage: 'processing',
              message: 'Exporting inventory...',
              current: 0,
              total: 100,
            });

            try {
              const result = await squareExportService.exportInventoryBatch(ingredients);

              setSyncProgress({
                stage: 'complete',
                message: 'Export complete!',
                current: 100,
                total: 100,
              });

              if (result.success) {
                Alert.alert(
                  'Export Complete!',
                  `Exported ${result.syncedCount} inventory item(s) to Square.`,
                  [{ text: 'OK', onPress: () => setShowSyncModal(false) }]
                );
              } else {
                const errorMsg = result.errors.length > 0
                  ? `Exported ${result.syncedCount}. Errors:\n${result.errors.slice(0, 3).join('\n')}`
                  : 'Export failed';
                Alert.alert('Export Issues', errorMsg);
                setShowSyncModal(false);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to export inventory. Please try again.');
              setShowSyncModal(false);
            } finally {
              setIsSyncing(false);
            }
          },
        },
      ]
    );
  };

  const handleDisconnectPOS = () => {
    Alert.alert(
      'Disconnect from Square',
      'Are you sure you want to disconnect? You will need to reconnect to use the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectSquare();
              // The root layout will automatically redirect to Square onboarding
            } catch (error) {
              Alert.alert('Error', 'Failed to disconnect. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
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
              Alert.alert('Error', 'Failed to log out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const getSyncModalTitle = () => {
    switch (syncType) {
      case 'import_menu':
        return 'Importing Menu Items';
      case 'import_inventory':
        return 'Importing Inventory';
      case 'export_recipes':
        return 'Exporting Recipes';
      case 'export_inventory':
        return 'Exporting Inventory';
      default:
        return 'Syncing with Square';
    }
  };

  const renderSyncModal = () => (
    <Modal visible={showSyncModal} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.squareLogoLarge}>
              <Text style={styles.squareLogoTextLarge}>SQ</Text>
            </View>
            <Text style={styles.modalTitle}>{getSyncModalTitle()}</Text>
          </View>

          {syncProgress && (
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

          {isSyncing && <ActivityIndicator size="large" color="#2196f3" style={{ marginTop: 20 }} />}
        </View>
      </View>
    </Modal>
  );

  if (squareLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {renderSyncModal()}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your POS connection</Text>

        {/* POS Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POS Connection</Text>

          <View style={styles.posCard}>
            <View style={styles.posHeader}>
              <View style={styles.posProvider}>
                <View style={styles.squareLogo}>
                  <Text style={styles.squareLogoText}>SQ</Text>
                </View>
                <View>
                  <Text style={styles.posProviderName}>Square</Text>
                  <View style={styles.connectedRow}>
                    <View style={[styles.connectedDot, !isSquareConnected && styles.disconnectedDot]} />
                    <Text style={[styles.connectedLabel, !isSquareConnected && styles.disconnectedLabel]}>
                      {isSquareConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.syncButton}
                onPress={handleSyncNow}
                disabled={isSyncing || !isSquareConnected}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#2196f3" />
                ) : (
                  <>
                    <IconSymbol name="arrow.triangle.2.circlepath" size={18} color="#2196f3" />
                    <Text style={styles.syncButtonText}>Sync</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {merchantId && (
              <View style={styles.merchantInfo}>
                <IconSymbol name="building.2.fill" size={14} color="#999" />
                <Text style={styles.merchantText}>
                  Merchant: {merchantId.substring(0, 12)}...
                </Text>
              </View>
            )}

            <View style={styles.posMeta}>
              <IconSymbol name="clock.fill" size={14} color="#999" />
              <Text style={styles.lastSyncText}>
                Last synced:{' '}
                {lastSyncedAt
                  ? lastSyncedAt.toLocaleString('en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : 'Never'}
              </Text>
            </View>

            {/* Import/Export Actions */}
            <View style={styles.syncActionsContainer}>
              <Text style={styles.syncActionsTitle}>Import from Square</Text>
              <View style={styles.syncActionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, (!isSquareConnected || isSyncing) && styles.actionButtonDisabled]}
                  onPress={handleSyncNow}
                  disabled={isSyncing || !isSquareConnected}
                >
                  <IconSymbol name="menucard.fill" size={20} color={isSquareConnected ? "#2196f3" : "#999"} />
                  <Text style={[styles.actionButtonText, !isSquareConnected && styles.actionButtonTextDisabled]}>Menu Items</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, (!isSquareConnected || isSyncing) && styles.actionButtonDisabled]}
                  onPress={handleImportInventory}
                  disabled={isSyncing || !isSquareConnected}
                >
                  <IconSymbol name="shippingbox.fill" size={20} color={isSquareConnected ? "#2196f3" : "#999"} />
                  <Text style={[styles.actionButtonText, !isSquareConnected && styles.actionButtonTextDisabled]}>Inventory</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.syncActionsTitle, { marginTop: 16 }]}>Export to Square</Text>
              <View style={styles.syncActionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonExport, (!isSquareConnected || isSyncing) && styles.actionButtonDisabled]}
                  onPress={handleExportRecipes}
                  disabled={isSyncing || !isSquareConnected}
                >
                  <IconSymbol name="doc.text.fill" size={20} color={isSquareConnected ? "#4caf50" : "#999"} />
                  <Text style={[styles.actionButtonText, styles.actionButtonTextExport, !isSquareConnected && styles.actionButtonTextDisabled]}>
                    Recipes ({recipes.filter(r => r.status === 'ready_to_import').length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonExport, (!isSquareConnected || isSyncing) && styles.actionButtonDisabled]}
                  onPress={handleExportInventory}
                  disabled={isSyncing || !isSquareConnected}
                >
                  <IconSymbol name="arrow.up.doc.fill" size={20} color={isSquareConnected ? "#4caf50" : "#999"} />
                  <Text style={[styles.actionButtonText, styles.actionButtonTextExport, !isSquareConnected && styles.actionButtonTextDisabled]}>
                    Inventory ({ingredients.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnectPOS}>
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {/* User Email Display */}
          {user && (
            <View style={styles.userCard}>
              <View style={styles.userAvatar}>
                <IconSymbol name="person.fill" size={24} color="#fff" />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userEmail}>{user.email}</Text>
                <Text style={styles.userLabel}>Signed in</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.settingRow}>
            <IconSymbol name="person.circle.fill" size={24} color="#666" />
            <Text style={styles.settingText}>Profile</Text>
            <IconSymbol name="chevron.right" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <IconSymbol name="bell.fill" size={24} color="#666" />
            <Text style={styles.settingText}>Notifications</Text>
            <IconSymbol name="chevron.right" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <IconSymbol name="questionmark.circle.fill" size={24} color="#666" />
            <Text style={styles.settingText}>Help & Support</Text>
            <IconSymbol name="chevron.right" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingRow, styles.logoutRow]} onPress={handleLogout}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={24} color="#f44336" />
            <Text style={[styles.settingText, styles.logoutText]}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
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
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  posCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  posHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  posProvider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  squareLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareLogoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  squareLogoLarge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  squareLogoTextLarge: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  posProviderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4caf50',
  },
  disconnectedDot: {
    backgroundColor: '#f44336',
  },
  connectedLabel: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
  },
  disconnectedLabel: {
    color: '#f44336',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    minWidth: 100,
    justifyContent: 'center',
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196f3',
  },
  merchantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  merchantText: {
    fontSize: 12,
    color: '#999',
  },
  posMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  lastSyncText: {
    fontSize: 12,
    color: '#999',
  },
  disconnectButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  disconnectButtonText: {
    fontSize: 14,
    color: '#f44336',
    fontWeight: '600',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2196f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  userLabel: {
    fontSize: 12,
    color: '#4caf50',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  settingText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  logoutRow: {
    marginTop: 16,
  },
  logoutText: {
    color: '#f44336',
    fontWeight: '600',
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
  syncActionsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  syncActionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  syncActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonExport: {
    backgroundColor: '#e8f5e9',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196f3',
  },
  actionButtonTextExport: {
    color: '#4caf50',
  },
  actionButtonDisabled: {
    backgroundColor: '#f0f0f0',
    opacity: 0.6,
  },
  actionButtonTextDisabled: {
    color: '#999',
  },
});
