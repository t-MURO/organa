import type { Task } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.native";
import type { TaskRepository } from "./task-repository.types";

interface TaskRow {
  payload: string;
}

export function createTaskRepository(namespace = "local"): TaskRepository {
  const databasePromise = openOrganaDatabase(namespace);

  return {
    async initialize() {
      await databasePromise;
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
