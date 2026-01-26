import { TopBar } from '@/components/TopBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRecipes } from '@/hooks/database/useRecipes';
import type { Recipe } from '@/types/recipe';
import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function InboxScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'ready' | 'review' | 'failed'>('all');

  // Load recipes from database
  const { recipes, loading, error, loadRecipes } = useRecipes();

  // Reload recipes when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [loadRecipes])
  );

  const getFilteredRecipes = () => {
    let filtered = recipes;

    if (activeTab !== 'all') {
      if (activeTab === 'ready') filtered = filtered.filter((r) => r.status === 'ready_to_import');
      if (activeTab === 'review') filtered = filtered.filter((r) => r.status === 'needs_review');
      if (activeTab === 'failed') filtered = filtered.filter((r) => r.status === 'import_failed');
    }

    if (searchQuery) {
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  };

  const getTabCount = (tab: typeof activeTab) => {
    if (tab === 'all') return recipes.length;
    if (tab === 'ready') return recipes.filter((r) => r.status === 'ready_to_import').length;
    if (tab === 'review') return recipes.filter((r) => r.status === 'needs_review').length;
    if (tab === 'failed') return recipes.filter((r) => r.status === 'import_failed').length;
    return 0;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <TopBar />
        <View style={[styles.content, styles.centerContent]}>
          <ActivityIndicator size="large" color="#2196f3" />
          <Text style={styles.loadingText}>Loading recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <TopBar />
        <View style={[styles.content, styles.centerContent]}>
          <Text style={styles.errorText}>Error loading recipes: {error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar />

      <View style={styles.content}>
        <Text style={styles.title}>Inbox</Text>
        <Text style={styles.subtitle}>Review and import your recipes</Text>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <IconSymbol name="magnifyingglass" size={18} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'all' && styles.activeTab]}
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
              All ({getTabCount('all')})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'ready' && styles.activeTab]}
            onPress={() => setActiveTab('ready')}
          >
            <Text style={[styles.tabText, activeTab === 'ready' && styles.activeTabText]}>
              Ready ({getTabCount('ready')})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'review' && styles.activeTab]}
            onPress={() => setActiveTab('review')}
          >
            <Text style={[styles.tabText, activeTab === 'review' && styles.activeTabText]}>
              Review ({getTabCount('review')})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'failed' && styles.activeTab]}
            onPress={() => setActiveTab('failed')}
          >
            <Text style={[styles.tabText, activeTab === 'failed' && styles.activeTabText]}>
              Failed ({getTabCount('failed')})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recipe List */}
        <FlatList
          data={getFilteredRecipes()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RecipeCard recipe={item} onPress={() => {}} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

function RecipeCard({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  const getStatusColor = () => {
    if (recipe.status === 'ready_to_import') return '#4caf50';
    if (recipe.status === 'needs_review') return '#ff9800';
    return '#f44336';
  };

  const getStatusText = () => {
    if (recipe.status === 'ready_to_import') return 'Ready to Import';
    if (recipe.status === 'needs_review') return 'Needs Review';
    return 'Import Failed';
  };

  const getConfidenceBadge = () => {
    if (recipe.confidence === 'high')
      return <View style={[styles.confidenceBadge, { backgroundColor: '#4caf50' }]} />;
    if (recipe.confidence === 'medium')
      return <View style={[styles.confidenceBadge, { backgroundColor: '#ff9800' }]} />;
    return <View style={[styles.confidenceBadge, { backgroundColor: '#f44336' }]} />;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {getConfidenceBadge()}
          <Text style={styles.cardTitle}>{recipe.name}</Text>
        </View>
        <Text style={styles.cardDate}>
          Updated {recipe.lastUpdated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      <View style={styles.cardMeta}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>{getStatusText()}</Text>
        </View>

        <View style={styles.ingredientBadge}>
          <IconSymbol name="list.bullet" size={14} color="#666" />
          <Text style={styles.ingredientText}>{recipe.ingredients.length} ingredients</Text>
        </View>
      </View>

      {recipe.issues.length > 0 && (
        <View style={styles.issuesContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#ff9800" />
          <Text style={styles.issuesText}>{recipe.issues.length} issue(s) to resolve</Text>
        </View>
      )}
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
  tabs: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  activeTab: {
    backgroundColor: '#2196f3',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  list: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  confidenceBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  cardDate: {
    fontSize: 12,
    color: '#999',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ingredientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  ingredientText: {
    fontSize: 12,
    color: '#666',
  },
  issuesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#fff3e0',
    borderRadius: 6,
  },
  issuesText: {
    fontSize: 12,
    color: '#e65100',
  },
});
