import * as SecureStore from "expo-secure-store";

const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} satisfies SecureStore.SecureStoreOptions;

export async function getDeviceBoundItem(key: string) {
  const value = await SecureStore.getItemAsync(key);
  if (value !== null) {
    // Rewriting also migrates older iOS entries that were backup-migratable.
    await SecureStore.setItemAsync(key, value, options);
  }
  return value;
}

export function setDeviceBoundItem(key: string, value: string) {
  return SecureStore.setItemAsync(key, value, options);
}

export function removeDeviceBoundItem(key: string) {
  return SecureStore.deleteItemAsync(key);
}
