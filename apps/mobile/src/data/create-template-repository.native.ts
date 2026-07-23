import type { TaskTemplate } from "@organa/domain";
import * as SQLite from "expo-sqlite";

import type { TemplateRepository } from "./template-repository.types";

interface TemplateRow {
  payload: string;
}

export function createTemplateRepository(namespace = "local"): TemplateRepository {
  const databasePromise = SQLite.openDatabaseAsync(databaseName(namespace));

  return {
    async initialize() {
      const database = await databasePromise;
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS task_templates (
          id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
    async list() {
      const database = await databasePromise;
      const rows = await database.getAllAsync<TemplateRow>(
        "SELECT payload FROM task_templates ORDER BY updated_at ASC",
      );
      return rows.map((row) => JSON.parse(row.payload) as TaskTemplate);
    },
    async upsert(template) {
      const database = await databasePromise;
      await database.runAsync(
        `INSERT INTO task_templates (id, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        template.id,
        JSON.stringify(template),
        template.updatedAt,
      );
    },
    async remove(id) {
      const database = await databasePromise;
      await database.runAsync("DELETE FROM task_templates WHERE id = ?", id);
    },
  };
}

function databaseName(namespace: string) {
  return `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
}
