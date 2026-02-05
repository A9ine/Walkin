import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { squareAuthService } from '@/services/square/square-auth.service';
import * as SecureStore from 'expo-secure-store';

const SQUARE_INITIAL_SYNC_KEY = 'square_initial_sync_complete';

interface SquareAuthContextType {
  isSquareConnected: boolean;
  isInitialSyncComplete: boolean;
  isLoading: boolean;
  merchantId: string | null;
  connectSquare: () => Promise<{ success: boolean; error?: string }>;
  disconnectSquare: () => Promise<void>;
  markInitialSyncComplete: () => Promise<void>;
  refreshConnectionStatus: () => Promise<void>;
}

const SquareAuthContext = createContext<SquareAuthContextType | undefined>(undefined);

interface SquareAuthProviderProps {
  children: ReactNode;
}

export function SquareAuthProvider({ children }: SquareAuthProviderProps) {
  const [isSquareConnected, setIsSquareConnected] = useState(false);
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [merchantId, setMerchantId] = useState<string | null>(null);

  useEffect(() => {
    checkSquareStatus();
  }, []);

  const checkSquareStatus = async () => {
    try {
      setIsLoading(true);

      // First check if tokens exist locally
      const isAuthenticated = await squareAuthService.isAuthenticated();

      if (!isAuthenticated) {
        setIsSquareConnected(false);
        setMerchantId(null);
        setIsInitialSyncComplete(false);
        return;
      }

      // Validate the connection with Square API to ensure tokens are still valid
      const isValid = await squareAuthService.validateConnection();

      if (!isValid) {
        // Tokens are invalid, clear them
        console.log('Square tokens are invalid, clearing connection state');
        setIsSquareConnected(false);
        setMerchantId(null);
        setIsInitialSyncComplete(false);
        return;
      }

      const tokens = await squareAuthService.getStoredTokens();
      setIsSquareConnected(true);
      setMerchantId(tokens?.merchantId || null);

      // Check if initial sync has been completed
      const syncComplete = await SecureStore.getItemAsync(SQUARE_INITIAL_SYNC_KEY);
      setIsInitialSyncComplete(syncComplete === 'true');
    } catch (error) {
      console.error('Error checking Square status:', error);
      setIsSquareConnected(false);
      setMerchantId(null);
      setIsInitialSyncComplete(false);
    } finally {
      setIsLoading(false);
    }
  };

  const connectSquare = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await squareAuthService.authorize();

      if (result.success) {
        setIsSquareConnected(true);
        setMerchantId(result.merchantId || null);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error connecting to Square:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Square'
      };
    }
  };

  const disconnectSquare = async (): Promise<void> => {
    try {
      // Always update local state first to ensure UI reflects disconnected state
      setIsSquareConnected(false);
      setIsInitialSyncComplete(false);
      setMerchantId(null);

      // Then clear stored data
      await squareAuthService.disconnect();
      await SecureStore.deleteItemAsync(SQUARE_INITIAL_SYNC_KEY);
    } catch (error) {
      console.error('Error disconnecting from Square:', error);
      // Even if clearing storage fails, keep the state as disconnected
      // to prevent a stuck "connected" state
    }
  };

  const markInitialSyncComplete = async (): Promise<void> => {
    try {
      await SecureStore.setItemAsync(SQUARE_INITIAL_SYNC_KEY, 'true');
      setIsInitialSyncComplete(true);
    } catch (error) {
      console.error('Error marking sync complete:', error);
      throw error;
    }
  };

  const refreshConnectionStatus = async (): Promise<void> => {
    await checkSquareStatus();
  };

  const value: SquareAuthContextType = {
    isSquareConnected,
    isInitialSyncComplete,
    isLoading,
    merchantId,
    connectSquare,
    disconnectSquare,
    markInitialSyncComplete,
    refreshConnectionStatus,
  };

  return <SquareAuthContext.Provider value={value}>{children}</SquareAuthContext.Provider>;
}

export function useSquareAuth(): SquareAuthContextType {
  const context = useContext(SquareAuthContext);
  if (context === undefined) {
    throw new Error('useSquareAuth must be used within a SquareAuthProvider');
  }
  return context;
}

export { SquareAuthContext };
