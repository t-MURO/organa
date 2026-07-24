import type {
  ContentKeyVault,
  ContentKeyVaultValue,
} from "./content-key-vault.types";
import { parseContentKeyVaultValue } from "./content-key-vault.validation";

interface WrappedContentKey {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  wrappingKey: CryptoKey;
}

const memoryFallback = new Map<string, ContentKeyVaultValue>();
const databaseName = "organa-protected-key-vault";
const storeName = "content-keys";

export const contentKeyVault: ContentKeyVault = {
  async get(userId) {
    try {
      const wrapped = await readWrappedKey(userId);
      if (!wrapped) return memoryFallback.get(userId) ?? null;
      const plaintext = await crypto.subtle.decrypt(
        { iv: wrapped.iv, name: "AES-GCM" },
        wrapped.wrappingKey,
        wrapped.ciphertext,
      );
      return parseContentKeyVaultValue(
        new TextDecoder().decode(plaintext),
      );
    } catch {
      return memoryFallback.get(userId) ?? null;
    }
  },
  async set(userId, value) {
    memoryFallback.set(userId, value);
    try {
      const wrappingKey = await crypto.subtle.generateKey(
        { length: 256, name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { iv, name: "AES-GCM" },
        wrappingKey,
        new TextEncoder().encode(JSON.stringify(value)),
      );
      await writeWrappedKey(userId, { ciphertext, iv, wrappingKey });
    } catch {
      // Recovery remains available if this browser blocks durable key storage.
    }
  },
  async remove(userId) {
    memoryFallback.delete(userId);
    try {
      const database = await openKeyDatabase();
      await requestAsPromise(
        database.transaction(storeName, "readwrite").objectStore(storeName).delete(
          userId,
        ),
      );
      database.close();
    } catch {
      // There is no durable key to remove when IndexedDB is unavailable.
    }
  },
};

async function readWrappedKey(userId: string) {
  const database = await openKeyDatabase();
  const value = await requestAsPromise<WrappedContentKey | undefined>(
    database.transaction(storeName).objectStore(storeName).get(userId),
  );
  database.close();
  return value;
}

async function writeWrappedKey(userId: string, value: WrappedContentKey) {
  const database = await openKeyDatabase();
  await requestAsPromise(
    database
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .put(value, userId),
  );
  database.close();
}

function openKeyDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestAsPromise<T = undefined>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
