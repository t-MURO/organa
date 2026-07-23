import * as SecureStore from "expo-secure-store";

import type { AuthStorage } from "./auth-storage.types";

const chunkSize = 1800;

export const authStorage: AuthStorage = {
  async getItem(key) {
    const countValue = await SecureStore.getItemAsync(metaKey(key));
    if (!countValue) return SecureStore.getItemAsync(key);

    const count = Number(countValue);
    if (!Number.isInteger(count) || count <= 0) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index)),
      ),
    );
    return chunks.every((chunk): chunk is string => chunk !== null)
      ? chunks.join("")
      : null;
  },
  async setItem(key, value) {
    await removeChunkedValue(key);
    if (value.length <= chunkSize) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunks = Array.from(
      { length: Math.ceil(value.length / chunkSize) },
      (_, index) => value.slice(index * chunkSize, (index + 1) * chunkSize),
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk),
      ),
    );
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));
  },
  async removeItem(key) {
    await removeChunkedValue(key);
  },
};

async function removeChunkedValue(key: string) {
  const countValue = await SecureStore.getItemAsync(metaKey(key));
  const count = Number(countValue ?? 0);
  if (Number.isInteger(count) && count > 0) {
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.deleteItemAsync(chunkKey(key, index)),
      ),
    );
  }
  await Promise.all([
    SecureStore.deleteItemAsync(metaKey(key)),
    SecureStore.deleteItemAsync(key),
  ]);
}

function metaKey(key: string) {
  return `${key}.chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}.chunk.${index}`;
}
