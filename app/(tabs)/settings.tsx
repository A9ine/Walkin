import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { squareAuthService } from '@/services/square/square-auth.service';
import { squareImportService, type ImportProgress } from '@/services/square/square-import.service';
import React, { useState, useEffect } from 'react';
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

interface POSConnectionState {
  isConnected: boolean;
  provider: string;
  merchantId?: string;
  lastSyncedAt?: Date;
}

export default function SettingsScreen() {
  const { user, signOut, isGuest } = useAuth();

  const [posConnection, setPosConnection] = useState<POSConnectionState>({
    isConnected: false,
    provider: 'square',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<ImportProgress | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Check Square connection status on mount
  useEffect(() => {
    checkSquareConnection();
  }, []);

  const checkSquareConnection = async () => {
    try {
      const isAuthenticated = await squareAuthService.isAuthenticated();
      const tokens = await squareAuthService.getStoredTokens();

      setPosConnection({
        isConnected: isAuthenticated,
        provider: 'square',
        merchantId: tokens?.merchantId,
        lastSyncedAt: isAuthenticated ? new Date() : undefined,
      });
    } catch (error) {
      console.error('Error checking Square connection:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectSquare = async () => {
    setIsLoading(true);

    try {
      const result = await squareAuthService.authorize();

      if (result.success) {
        setPosConnection({
          isConnected: true,
          provider: 'square',
          merchantId: result.merchantId,
          lastSyncedAt: new Date(),
        });

        // Show sync modal after successful connection
        Alert.alert(
          'Connected to Square!',
          'Would you like to sync your menu items now?',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Sync Now', onPress: handleSyncNow },
          ]
        );
      } else {
        Alert.alert('Connection Failed', result.error || 'Failed to connect to Square');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Square. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncNow = async () => {
    if (!posConnection.isConnected) {
      // If not connected, start the auth flow first
      handleConnectSquare();
      return;
    }

    setShowSyncModal(true);
    setIsSyncing(true);
    setSyncProgress(null);

    try {
      const result = await squareImportService.importCatalog((progress) => {
        setSyncProgress(progress);
      });

      if (result.success) {
        setPosConnection(prev => ({
          ...prev,
          lastSyncedAt: new Date(),
        }));

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

  const handleDisconnectPOS = () => {
    Alert.alert(
      'Disconnect from Square',
      'Are you sure you want to disconnect? Your local data will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await squareAuthService.disconnect();
            setPosConnection({
              isConnected: false,
              provider: 'square',
            });
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      isGuest ? 'Exit Guest Mode' : 'Log Out',
      isGuest
        ? 'Are you sure you want to exit guest mode?'
        : 'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isGuest ? 'Exit' : 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              Alert.alert('Error', 'Failed to log out. Please try again.');
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
            <View style={styles.squareLogoLarge}>
              <Text style={styles.squareLogoTextLarge}>SQ</Text>
            </View>
            <Text style={styles.modalTitle}>Syncing with Square</Text>
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

  if (isLoading) {
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

          {posConnection.isConnected ? (
            <View style={styles.posCard}>
              <View style={styles.posHeader}>
                <View style={styles.posProvider}>
                  <View style={styles.squareLogo}>
                    <Text style={styles.squareLogoText}>SQ</Text>
                  </View>
                  <View>
                    <Text style={styles.posProviderName}>Square</Text>
                    <View style={styles.connectedRow}>
                      <View style={styles.connectedDot} />
                      <Text style={styles.connectedLabel}>Connected</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.syncButton}
                  onPress={handleSyncNow}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#2196f3" />
                  ) : (
                    <>
                      <IconSymbol name="arrow.triangle.2.circlepath" size={18} color="#2196f3" />
                      <Text style={styles.syncButtonText}>Sync Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {posConnection.merchantId && (
                <View style={styles.merchantInfo}>
                  <IconSymbol name="building.2.fill" size={14} color="#999" />
                  <Text style={styles.merchantText}>
                    Merchant: {posConnection.merchantId.substring(0, 12)}...
                  </Text>
                </View>
              )}

              <View style={styles.posMeta}>
                <IconSymbol name="clock.fill" size={14} color="#999" />
                <Text style={styles.lastSyncText}>
                  Last synced:{' '}
                  {posConnection.lastSyncedAt
                    ? posConnection.lastSyncedAt.toLocaleString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'Never'}
                </Text>
              </View>

              <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnectPOS}>
                <Text style={styles.disconnectButtonText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.connectPOSCard}
              onPress={handleConnectSquare}
              disabled={isLoading}
            >
              <View style={styles.squareLogo}>
                <Text style={styles.squareLogoText}>SQ</Text>
              </View>
              <Text style={styles.connectTitle}>Connect to Square</Text>
              <Text style={styles.connectText}>Sync your menu items and ingredients</Text>

              <View style={styles.connectButton}>
                <Text style={styles.connectButtonText}>Connect Account</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

          {/* User Email Display */}
          {user && (
            <View style={styles.userCard}>
              <View style={[styles.userAvatar, isGuest && styles.guestAvatar]}>
                <IconSymbol name="person.fill" size={24} color="#fff" />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userEmail}>
                  {isGuest ? 'Guest User' : user.email}
                </Text>
                <Text style={[styles.userLabel, isGuest && styles.guestLabel]}>
                  {isGuest ? 'Guest mode - data stored locally' : 'Signed in'}
                </Text>
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
            <Text style={[styles.settingText, styles.logoutText]}>
              {isGuest ? 'Exit Guest Mode' : 'Log Out'}
            </Text>
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
  connectedLabel: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
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
  connectPOSCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e0e0e0',
  },
  connectTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  connectText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
    marginBottom: 20,
  },
  connectButton: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
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
  guestAvatar: {
    backgroundColor: '#9e9e9e',
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
  guestLabel: {
    color: '#ff9800',
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
});
