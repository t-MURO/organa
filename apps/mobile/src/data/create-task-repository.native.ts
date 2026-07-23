import type { Task } from "@organa/domain";
import * as SQLite from "expo-sqlite";

import type { TaskRepository } from "./task-repository.types";

interface TaskRow {
  payload: string;
}

export function createTaskRepository(): TaskRepository {
  const databasePromise = SQLite.openDatabaseAsync("organa.db");

  return {
    async initialize() {
      const database = await databasePromise;
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
    async list() {
      const database = await databasePromise;
      const rows = await database.getAllAsync<TaskRow>(
        "SELECT payload FROM tasks ORDER BY updated_at ASC",
      );
      return rows.map((row) => JSON.parse(row.payload) as Task);
    },
    async upsert(task) {
      const database = await databasePromise;
      await database.runAsync(
        `INSERT INTO tasks (id, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        task.id,
        JSON.stringify(task),
        task.updatedAt,
      );
    },
    async remove(id) {
      const database = await databasePromise;
      await database.runAsync("DELETE FROM tasks WHERE id = ?", id);
    },
  };
}
