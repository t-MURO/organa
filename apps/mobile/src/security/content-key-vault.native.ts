import type { ContentKey } from "@organa/crypto";
import * as SecureStore from "expo-secure-store";

import type { ContentKeyVault } from "./content-key-vault.types";

export const contentKeyVault: ContentKeyVault = {
  async get(userId) {
    const value = await SecureStore.getItemAsync(storageKey(userId));
    return value ? (JSON.parse(value) as ContentKey) : null;
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
