import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
  TaskTemplate,
  UserSettings,
} from "@organa/domain";
import type { EncryptedMutation } from "./sync-outbox.types";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface OrganaDatabase extends DBSchema {
  tasks: {
    key: string;
    value: Task;
    indexes: {
      "by-updated-at": string;
    };
  };
  brainDumpBullets: {
    key: string;
    value: BrainDumpBullet;
    indexes: {
      "by-rank": number;
    };
  };
  checkIns: {
    key: string;
    value: CheckInEntry;
    indexes: {
      "by-date": string;
    };
  };
  taskTemplates: {
    key: string;
    value: TaskTemplate;
    indexes: {
      "by-updated-at": string;
    };
  };
  syncOutbox: {
    key: string;
    value: EncryptedMutation;
    indexes: {
      "by-created-at": string;
    };
  };
  settings: {
    key: string;
    value: UserSettings;
  };
}

const databasePromises = new Map<
  string,
  Promise<IDBPDatabase<OrganaDatabase>>
>();

export function openOrganaDatabase(namespace = "local") {
  let databasePromise = databasePromises.get(namespace);
  if (!databasePromise) {
    databasePromise = openDB<OrganaDatabase>(`organa:${namespace}`, 6, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const taskStore = database.createObjectStore("tasks", {
            keyPath: "id",
          });
          taskStore.createIndex("by-updated-at", "updatedAt");
        }

        if (oldVersion < 2) {
          const bulletStore = database.createObjectStore("brainDumpBullets", {
            keyPath: "id",
          });
          bulletStore.createIndex("by-rank", "rank");
        }

        if (oldVersion < 3) {
          const checkInStore = database.createObjectStore("checkIns", {
            keyPath: "id",
          });
          checkInStore.createIndex("by-date", "date", { unique: true });
        }

        if (oldVersion < 4) {
          const templateStore = database.createObjectStore("taskTemplates", {
            keyPath: "id",
          });
          templateStore.createIndex("by-updated-at", "updatedAt");
        }

        if (oldVersion < 5) {
          const outboxStore = database.createObjectStore("syncOutbox", {
            keyPath: "id",
          });
          outboxStore.createIndex("by-created-at", "createdAt");
        }

        if (oldVersion < 6) {
          database.createObjectStore("settings", { keyPath: "id" });
        }
      },
    });
    databasePromises.set(namespace, databasePromise);
  }

  return databasePromise;
}

export async function deleteOrganaDatabase(namespace: string) {
  const database = await openOrganaDatabase(namespace);
  const storeNames = Array.from(database.objectStoreNames);
  if (storeNames.length > 0) {
    const transaction = database.transaction(storeNames, "readwrite");
    await Promise.all(
      storeNames.map((storeName) => transaction.objectStore(storeName).clear()),
    );
    await transaction.done;
  }
  database.close();
  databasePromises.delete(namespace);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`organa:${namespace}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
