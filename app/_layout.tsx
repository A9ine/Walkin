import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDatabase } from '@/hooks/database/useDatabase';
import { AuthProvider } from '@/contexts/AuthContext';
import { SquareAuthProvider } from '@/contexts/SquareAuthContext';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { error: dbError } = useDatabase();

  if (dbError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Database Error: {dbError.message}</Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(square-onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="recipe-detail" />
        <Stack.Screen name="menu-item-detail" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
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
