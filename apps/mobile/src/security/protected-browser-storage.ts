interface ProtectedBrowserRecord {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  version: 1;
  wrappingKey: CryptoKey;
}

const databaseName = "organa-protected-browser-storage";
const storeName = "entries";
const memoryFallback = new Map<string, string>();

export async function getProtectedBrowserValue(key: string) {
  const legacyValue = legacyStorage()?.getItem(key) ?? null;
  if (supportsProtectedStorage()) {
    if (legacyValue !== null) {
      try {
        await writeRecord(key, legacyValue);
        legacyStorage()?.removeItem(key);
      } catch {
        // The current fallback remains authoritative until migration succeeds.
      }
      memoryFallback.set(key, legacyValue);
      return legacyValue;
    }

    try {
      const record = await readRecord(key);
      if (record) {
        const value = await decryptRecord(key, record);
        memoryFallback.set(key, value);
        return value;
      }
    } catch {
      // Fall through to the legacy or memory path on restricted browsers.
    }
  }

  return legacyValue ?? memoryFallback.get(key) ?? null;
}

export async function setProtectedBrowserValue(key: string, value: string) {
  memoryFallback.set(key, value);
  if (supportsProtectedStorage()) {
    try {
      await writeRecord(key, value);
      legacyStorage()?.removeItem(key);
      return;
    } catch {
      // Preserve the session on browsers that reject durable CryptoKey clones.
    }
  }
  legacyStorage()?.setItem(key, value);
}

export async function removeProtectedBrowserValue(key: string) {
  memoryFallback.delete(key);
  legacyStorage()?.removeItem(key);
  if (!supportsProtectedStorage()) return;

  const database = await openDatabase();
  try {
    await requestAsPromise(
      database
        .transaction(storeName, "readwrite")
        .objectStore(storeName)
        .delete(key),
    );
  } finally {
    database.close();
  }
}

async function readRecord(key: string) {
  const database = await openDatabase();
  try {
    return await requestAsPromise<ProtectedBrowserRecord | undefined>(
      database.transaction(storeName).objectStore(storeName).get(key),
    );
  } finally {
    database.close();
  }
}

async function writeRecord(key: string, value: string) {
  const wrappingKey = await crypto.subtle.generateKey(
    { length: 256, name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: new TextEncoder().encode(key),
      iv,
      name: "AES-GCM",
    },
    wrappingKey,
    new TextEncoder().encode(value),
  );
  const database = await openDatabase();
  try {
    await requestAsPromise(
      database
        .transaction(storeName, "readwrite")
        .objectStore(storeName)
        .put(
          {
            ciphertext,
            iv,
            version: 1,
            wrappingKey,
          } satisfies ProtectedBrowserRecord,
          key,
        ),
    );
  } finally {
    database.close();
  }
}

async function decryptRecord(key: string, record: ProtectedBrowserRecord) {
  if (
    record.version !== 1 ||
    !(record.ciphertext instanceof ArrayBuffer) ||
    !(record.iv instanceof Uint8Array) ||
    record.iv.byteLength !== 12 ||
    typeof CryptoKey === "undefined" ||
    !(record.wrappingKey instanceof CryptoKey)
  ) {
    throw new Error("Protected browser storage contains an invalid record.");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      additionalData: new TextEncoder().encode(key),
      iv: record.iv,
      name: "AES-GCM",
    },
    record.wrappingKey,
    record.ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

function openDatabase() {
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
      reject(new Error("Protected browser storage is blocked."));
  });
}

function requestAsPromise<T = undefined>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function supportsProtectedStorage() {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function" &&
    typeof crypto.subtle?.decrypt === "function" &&
    typeof crypto.subtle?.encrypt === "function" &&
    typeof crypto.subtle?.generateKey === "function"
  );
}

function legacyStorage() {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function" ||
    typeof localStorage.setItem !== "function" ||
    typeof localStorage.removeItem !== "function"
  ) {
    return undefined;
  }
  return localStorage;
}
