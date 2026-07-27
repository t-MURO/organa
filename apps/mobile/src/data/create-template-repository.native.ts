import type { TaskTemplate } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.native";
import type { TemplateRepository } from "./template-repository.types";

interface TemplateRow {
  payload: string;
}

export function createTemplateRepository(namespace = "local"): TemplateRepository {
  const databasePromise = openOrganaDatabase(namespace);

  return {
    async initialize() {
      await databasePromise;
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
