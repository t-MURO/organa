import type {
  ContentKeyVault,
  ContentKeyVaultValue,
} from "./content-key-vault.types";
import { parseContentKeyVaultValue } from "./content-key-vault.validation";

interface WrappedContentKey {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  wrappingKey: CryptoKey;
  version?: 2;
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
        wrapped.version === 2
          ? {
              additionalData: vaultAdditionalData(userId),
              iv: wrapped.iv,
              name: "AES-GCM",
            }
          : { iv: wrapped.iv, name: "AES-GCM" },
        wrapped.wrappingKey,
        wrapped.ciphertext,
      );
      const value = parseContentKeyVaultValue(
        new TextDecoder().decode(plaintext),
      );
      memoryFallback.set(userId, value);
      if (wrapped.version !== 2) {
        await persistWrappedKey(userId, value).catch(() => undefined);
      }
      return value;
    } catch {
      return memoryFallback.get(userId) ?? null;
    }
  },
  async set(userId, value) {
    memoryFallback.set(userId, value);
    try {
      await persistWrappedKey(userId, value);
    } catch {
      // Recovery remains available if this browser blocks durable key storage.
    }
  },
  async remove(userId) {
    memoryFallback.delete(userId);
    if (typeof indexedDB === "undefined") return;
    const database = await openKeyDatabase();
    try {
      await requestAsPromise(
        database
          .transaction(storeName, "readwrite")
          .objectStore(storeName)
          .delete(userId),
      );
    } finally {
      database.close();
    }
  },
};

async function readWrappedKey(userId: string) {
  const database = await openKeyDatabase();
  try {
    return await requestAsPromise<WrappedContentKey | undefined>(
      database.transaction(storeName).objectStore(storeName).get(userId),
    );
  } finally {
    database.close();
  }
}

async function writeWrappedKey(userId: string, value: WrappedContentKey) {
  const database = await openKeyDatabase();
  try {
    await requestAsPromise(
      database
        .transaction(storeName, "readwrite")
        .objectStore(storeName)
        .put(value, userId),
    );
  } finally {
    database.close();
  }
}

async function persistWrappedKey(
  userId: string,
  value: ContentKeyVaultValue,
) {
  const wrappingKey = await crypto.subtle.generateKey(
    { length: 256, name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: vaultAdditionalData(userId),
      iv,
      name: "AES-GCM",
    },
    wrappingKey,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  await writeWrappedKey(userId, {
    ciphertext,
    iv,
    version: 2,
    wrappingKey,
  });
}

function vaultAdditionalData(userId: string) {
  return new TextEncoder().encode(`organa:browser-key-vault:v2:${userId}`);
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
    request.onblocked = () =>
      reject(new Error("The browser key vault is blocked."));
  });
}

function requestAsPromise<T = undefined>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
