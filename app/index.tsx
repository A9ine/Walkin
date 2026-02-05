import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useSquareAuth } from '@/contexts/SquareAuthContext';
import { useDatabase } from '@/hooks/database/useDatabase';

export default function Index() {
  const { isReady: dbReady } = useDatabase();
  const { user, loading: authLoading, isGuest } = useAuth();
  const { isSquareConnected, isInitialSyncComplete, isLoading: squareLoading } = useSquareAuth();

  // Show loading while checking auth state
  if (!dbReady || authLoading || squareLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2196f3" />
      </View>
    );
  }

  // Not logged in -> go to auth
  if (!user) {
    return <Redirect href="/(auth)" />;
  }

  // Logged in but needs Square onboarding (non-guest users only)
  if (!isGuest && (!isSquareConnected || !isInitialSyncComplete)) {
    return <Redirect href="/(square-onboarding)" />;
  }

  // Logged in and ready -> go to main app
  return <Redirect href="/(tabs)/inbox" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
