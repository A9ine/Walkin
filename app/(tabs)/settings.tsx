import { TopBar } from '@/components/TopBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { POSConnection, SyncLog } from '@/types/pos';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const [locations] = useState([
    { id: '1', name: 'Main Kitchen', address: '123 Food St, Downtown', isConnected: true },
    { id: '2', name: 'Uptown Branch', address: '456 Culinary Ave', isConnected: false },
  ]);

  const [posConnection] = useState<POSConnection>({
    provider: 'square',
    locationId: '1',
    locationName: 'Main Kitchen',
    isConnected: true,
    lastSyncedAt: new Date(Date.now() - 2 * 60 * 1000),
  });

  const [recentImports] = useState<SyncLog[]>([
    {
      id: '1',
      timestamp: new Date('2026-01-18T18:35:00'),
      type: 'recipe_import',
      status: 'success',
      itemsProcessed: 8,
      details: 'Created item "Chocolate Chip Cookie" with 8 ingredients',
    },
    {
      id: '2',
      timestamp: new Date('2026-01-18T19:58:00'),
      type: 'recipe_import',
      status: 'success',
      itemsProcessed: 8,
      details: 'Created item "Chocolate Chip Cookie" with 8 ingredients',
    },
  ]);

  const handleSyncNow = () => {
    Alert.alert('Sync Started', 'Syncing with Square POS...');
  };

  const handleConnectPOS = () => {
    Alert.alert('Connect POS', 'OAuth flow will be implemented here');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage POS connections and locations</Text>

        {/* Locations Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Locations</Text>
            <TouchableOpacity style={styles.addLocationButton}>
              <IconSymbol name="plus" size={16} color="#2196f3" />
              <Text style={styles.addLocationText}>Add Location</Text>
            </TouchableOpacity>
          </View>

          {locations.map((location) => (
            <View key={location.id} style={styles.locationCard}>
              <View style={styles.locationIcon}>
                <IconSymbol name="location.fill" size={24} color="#2196f3" />
              </View>

              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{location.name}</Text>
                <Text style={styles.locationAddress}>{location.address}</Text>

                {location.isConnected ? (
                  <View style={styles.connectedBadge}>
                    <IconSymbol name="checkmark.circle.fill" size={14} color="#4caf50" />
                    <Text style={styles.connectedText}>Square</Text>
                  </View>
                ) : (
                  <View style={styles.notConnectedBadge}>
                    <Text style={styles.notConnectedText}>Not Connected</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* POS Integration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POS Integration</Text>

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

                <TouchableOpacity style={styles.syncButton} onPress={handleSyncNow}>
                  <IconSymbol name="arrow.triangle.2.circlepath" size={18} color="#2196f3" />
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.posMeta}>
                <IconSymbol name="clock.fill" size={14} color="#999" />
                <Text style={styles.lastSyncText}>
                  Last synced:{' '}
                  {posConnection.lastSyncedAt
                    ? new Date(posConnection.lastSyncedAt).toLocaleString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : 'Never'}
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.connectPOSCard} onPress={handleConnectPOS}>
              <View style={styles.posProviders}>
                <View style={styles.posProviderOption}>
                  <View style={styles.squareLogo}>
                    <Text style={styles.squareLogoText}>SQ</Text>
                  </View>
                  <Text style={styles.posOptionName}>Square</Text>
                </View>
                <View style={styles.posProviderOption}>
                  <View style={[styles.squareLogo, { backgroundColor: '#7c4dff' }]}>
                    <Text style={styles.squareLogoText}>CL</Text>
                  </View>
                  <Text style={styles.posOptionName}>Clover</Text>
                </View>
                <View style={styles.posProviderOption}>
                  <View style={[styles.squareLogo, { backgroundColor: '#ff6f00' }]}>
                    <Text style={styles.squareLogoText}>TO</Text>
                  </View>
                  <Text style={styles.posOptionName}>Toast</Text>
                </View>
              </View>
              <Text style={styles.connectText}>Tap to connect your POS system</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent Imports Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Imports</Text>

          {recentImports.map((log) => (
            <View key={log.id} style={styles.importCard}>
              <View style={styles.importLeft}>
                <View
                  style={[
                    styles.importIcon,
                    { backgroundColor: log.status === 'success' ? '#e8f5e9' : '#ffebee' },
                  ]}
                >
                  <IconSymbol
                    name={log.status === 'success' ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                    size={20}
                    color={log.status === 'success' ? '#4caf50' : '#f44336'}
                  />
                </View>

                <View style={styles.importInfo}>
                  <Text style={styles.importDetails}>{log.details}</Text>
                  <Text style={styles.importTime}>
                    {log.timestamp.toLocaleString('en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>

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

          <TouchableOpacity style={[styles.settingRow, styles.logoutRow]}>
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  addLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addLocationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196f3',
  },
  locationCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 13,
    color: '#999',
    marginBottom: 8,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
  notConnectedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  notConnectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
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
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2196f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareLogoText: {
    color: '#fff',
    fontSize: 14,
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
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196f3',
  },
  posMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lastSyncText: {
    fontSize: 12,
    color: '#999',
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
  posProviders: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
  },
  posProviderOption: {
    alignItems: 'center',
    gap: 8,
  },
  posOptionName: {
    fontSize: 12,
    color: '#666',
  },
  connectText: {
    fontSize: 14,
    color: '#999',
  },
  importCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  importLeft: {
    flexDirection: 'row',
    gap: 12,
  },
  importIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importInfo: {
    flex: 1,
  },
  importDetails: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  importTime: {
    fontSize: 12,
    color: '#999',
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
});
