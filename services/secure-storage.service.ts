import * as SecureStore from 'expo-secure-store';

const TOKEN_PREFIX = 'walkin_';

export class SecureStorageService {
  /**
   * Store a value securely
   */
  static async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(`${TOKEN_PREFIX}${key}`, value);
    } catch (error) {
      console.error('Failed to store secure item:', error);
      throw error;
    }
  }

  /**
   * Retrieve a securely stored value
   */
  static async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(`${TOKEN_PREFIX}${key}`);
    } catch (error) {
      console.error('Failed to get secure item:', error);
      return null;
    }
  }

  /**
   * Delete a securely stored value
   */
  static async deleteItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(`${TOKEN_PREFIX}${key}`);
    } catch (error) {
      console.error('Failed to delete secure item:', error);
      throw error;
    }
  }

  /**
   * Store POS access token for a specific provider and location
   */
  static async storePOSToken(
    provider: string,
    locationId: string,
    accessToken: string,
    refreshToken?: string
  ): Promise<{ accessTokenRef: string; refreshTokenRef?: string }> {
    const accessTokenRef = `pos_${provider}_${locationId}_access`;
    await this.setItem(accessTokenRef, accessToken);

    let refreshTokenRef: string | undefined;
    if (refreshToken) {
      refreshTokenRef = `pos_${provider}_${locationId}_refresh`;
      await this.setItem(refreshTokenRef, refreshToken);
    }

    return { accessTokenRef, refreshTokenRef };
  }

  /**
   * Get POS access token by reference
   */
  static async getPOSToken(tokenRef: string): Promise<string | null> {
    return this.getItem(tokenRef);
  }

  /**
   * Delete POS tokens for a specific provider and location
   */
  static async deletePOSTokens(provider: string, locationId: string): Promise<void> {
    await this.deleteItem(`pos_${provider}_${locationId}_access`);
    await this.deleteItem(`pos_${provider}_${locationId}_refresh`);
  }

  /**
   * Clear all stored tokens (for logout)
   */
  static async clearAll(): Promise<void> {
    // Note: SecureStore doesn't have a getAllKeys method
    // In a production app, you'd track stored keys in a separate list
    console.log('SecureStorage: clearAll called - individual keys must be tracked and cleared');
  }
}

export default SecureStorageService;
