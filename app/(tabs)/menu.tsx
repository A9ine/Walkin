import { TopBar } from '@/components/TopBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePOSMenuItems } from '@/hooks/database/usePOSMenuItems';
import type { POSMenuItem } from '@/types/pos';
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { syncRecipesToMenu } from '@/utils/sync-recipes-to-menu';

export default function MenuScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'mapped' | 'review' | 'missing'>('all');

  const { menuItems, loading, error, loadMenuItems } = usePOSMenuItems();

  // Reload menu items when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 Menu screen focused, reloading menu items...');
      loadMenuItems();
    }, [loadMenuItems])
  );

  const handleSyncRecipes = async () => {
    try {
      await syncRecipesToMenu();
      await loadMenuItems();
      Alert.alert('Success', 'Recipes synced to menu successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to sync recipes to menu');
    }
  };

  const getStatusCount = (status: 'mapped' | 'review' | 'missing') => {
    if (status === 'mapped') return menuItems.filter((m) => m.recipeStatus === 'mapped').length;
    if (status === 'review') return menuItems.filter((m) => m.recipeStatus === 'needs_review').length;
    if (status === 'missing') return menuItems.filter((m) => m.recipeStatus === 'missing').length;
    return 0;
  };

  const getFilteredItems = () => {
    let filtered = menuItems;

    if (filterStatus !== 'all') {
      if (filterStatus === 'mapped') filtered = filtered.filter((m) => m.recipeStatus === 'mapped');
      if (filterStatus === 'review') filtered = filtered.filter((m) => m.recipeStatus === 'needs_review');
      if (filterStatus === 'missing') filtered = filtered.filter((m) => m.recipeStatus === 'missing');
    }

    if (searchQuery) {
      filtered = filtered.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    return filtered;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <TopBar />
        <View style={[styles.content, styles.centerContent]}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading menu items...</Text>
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
            <Text style={styles.title}>Menu</Text>
            <Text style={styles.subtitle}>All items from your POS system</Text>
          </View>
          <TouchableOpacity style={styles.syncButton} onPress={handleSyncRecipes}>
            <IconSymbol name="arrow.clockwise" size={16} color="#2196f3" />
            <Text style={styles.syncButtonText}>Sync</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <IconSymbol name="magnifyingglass" size={18} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        {/* Status Summary */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[styles.summaryNumber, { color: '#2e7d32' }]}>{getStatusCount('mapped')}</Text>
            <Text style={[styles.summaryLabel, { color: '#2e7d32' }]}>Mapped</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: '#fff3e0' }]}>
            <Text style={[styles.summaryNumber, { color: '#e65100' }]}>{getStatusCount('review')}</Text>
            <Text style={[styles.summaryLabel, { color: '#e65100' }]}>Review</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: '#ffebee' }]}>
            <Text style={[styles.summaryNumber, { color: '#c62828' }]}>{getStatusCount('missing')}</Text>
            <Text style={[styles.summaryLabel, { color: '#c62828' }]}>Missing</Text>
          </View>
        </View>

        {/* Menu Items List */}
        <FlatList
          data={getFilteredItems()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MenuItemCard
              item={item}
              onPress={() => router.push(`/menu-item-detail?menuItemId=${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

function MenuItemCard({ item, onPress }: { item: POSMenuItem; onPress: () => void }) {
  const getStatusBadge = () => {
    if (item.recipeStatus === 'mapped') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#e8f5e9' }]}>
          <IconSymbol name="checkmark.circle.fill" size={14} color="#2e7d32" />
          <Text style={[styles.statusText, { color: '#2e7d32' }]}>Recipe Mapped</Text>
        </View>
      );
    }

    if (item.recipeStatus === 'needs_review') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: '#fff3e0' }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#e65100" />
          <Text style={[styles.statusText, { color: '#e65100' }]}>Needs Review</Text>
        </View>
      );
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: '#ffebee' }]}>
        <IconSymbol name="xmark.circle.fill" size={14} color="#c62828" />
        <Text style={[styles.statusText, { color: '#c62828' }]}>Missing Recipe</Text>
      </View>
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardLeft}>
        <IconSymbol name="doc.text.fill" size={24} color="#666" />
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.categoryText}>{item.category}</Text>
        {getStatusBadge()}
      </View>

      <IconSymbol name="chevron.right" size={20} color="#ccc" />
    </TouchableOpacity>
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
    alignItems: 'flex-start',
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
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
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
  cardLeft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
