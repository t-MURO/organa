import type { Task } from "@organa/domain";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { TaskRepository } from "./task-repository.types";

interface OrganaDatabase extends DBSchema {
  tasks: {
    key: string;
    value: Task;
    indexes: {
      "by-updated-at": string;
    };
  };
}

export function createTaskRepository(): TaskRepository {
  let database: IDBPDatabase<OrganaDatabase> | undefined;

  return {
    async initialize() {
      database = await openDB<OrganaDatabase>("organa", 1, {
        upgrade(nextDatabase) {
          const taskStore = nextDatabase.createObjectStore("tasks", {
            keyPath: "id",
          });
          taskStore.createIndex("by-updated-at", "updatedAt");
        },
      });
    },
    async list() {
      if (!database) {
        throw new Error("Task repository has not been initialized.");
      }

      return database.getAllFromIndex("tasks", "by-updated-at");
    },
    async upsert(task) {
      if (!database) {
        throw new Error("Task repository has not been initialized.");
      }

      await database.put("tasks", task);
    },
  };
}
