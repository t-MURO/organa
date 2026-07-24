import * as SecureStore from "expo-secure-store";

import type { ContentKeyVault } from "./content-key-vault.types";
import { parseContentKey } from "./content-key-vault.validation";

export const contentKeyVault: ContentKeyVault = {
  async get(userId) {
    const value = await SecureStore.getItemAsync(storageKey(userId));
    return value ? parseContentKey(value) : null;
  },
  async set(userId, key) {
    await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(key));
  },
  async remove(userId) {
    await SecureStore.deleteItemAsync(storageKey(userId));
  },
};

function storageKey(userId: string) {
  return `organa.content-key.${userId}`;
}
