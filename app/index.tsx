import { router } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useSquareAuth } from '@/contexts/SquareAuthContext';
import { useDatabase } from '@/hooks/database/useDatabase';

export default function Index() {
  const { isReady: dbReady } = useDatabase();
  const { user, loading: authLoading, isGuest } = useAuth();
  const { isSquareConnected, isInitialSyncComplete, isLoading: squareLoading } = useSquareAuth();

  const isLoading = !dbReady || authLoading || squareLoading;

  useEffect(() => {
    if (isLoading) return;

    // Not logged in -> go to auth
    if (!user) {
      router.replace('/(auth)');
      return;
    }

    // Logged in but needs Square onboarding (non-guest users only)
    if (!isGuest && (!isSquareConnected || !isInitialSyncComplete)) {
      router.replace('/(square-onboarding)');
      return;
    }

    // Logged in and ready -> go to main app
    router.replace('/(tabs)/inbox');
  }, [isLoading, user, isGuest, isSquareConnected, isInitialSyncComplete]);

  // Always show loading while determining where to navigate
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2196f3" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
