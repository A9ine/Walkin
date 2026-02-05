import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDatabase } from '@/hooks/database/useDatabase';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SquareAuthProvider, useSquareAuth } from '@/contexts/SquareAuthContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isReady: dbReady, error: dbError } = useDatabase();
  const { user, loading: authLoading, isGuest } = useAuth();
  const { isSquareConnected, isInitialSyncComplete, isLoading: squareLoading } = useSquareAuth();

  if (dbError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Database Error: {dbError.message}</Text>
      </View>
    );
  }

  if (!dbReady || authLoading || squareLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2196f3" />
        <Text style={styles.loadingText}>
          {!dbReady ? 'Initializing database...' : 'Checking authentication...'}
        </Text>
      </View>
    );
  }

  // Determine which screen to show:
  // 1. No user -> show auth screens
  // 2. User logged in but not connected to Square or hasn't synced -> show Square onboarding
  // 3. User logged in and Square connected with initial sync done -> show main app
  const needsSquareOnboarding = user && !isGuest && (!isSquareConnected || !isInitialSyncComplete);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="(auth)" />
        ) : needsSquareOnboarding ? (
          <Stack.Screen name="(square-onboarding)" />
        ) : (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="recipe-detail" />
            <Stack.Screen name="menu-item-detail" />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SquareAuthProvider>
          <RootLayoutNav />
        </SquareAuthProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
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
});
