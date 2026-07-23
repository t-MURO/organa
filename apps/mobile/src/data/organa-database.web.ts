import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
} from "@organa/domain";
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
}

let databasePromise: Promise<IDBPDatabase<OrganaDatabase>> | undefined;

export function openOrganaDatabase() {
  if (!databasePromise) {
    databasePromise = openDB<OrganaDatabase>("organa", 3, {
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
      },
    });
  }

  return databasePromise;
}
