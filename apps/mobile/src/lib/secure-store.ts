import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'huahua_refresh_token';

/** Mobile 通道：Refresh Token 存 SecureStore（Keychain/Keystore） */
export const secureStore = {
  getRefreshToken: (): Promise<string | null> => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string): Promise<void> => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
  clearRefreshToken: (): Promise<void> => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
};
