import type { UserSettings } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.native";
import type { SettingsRepository } from "./settings-repository.types";

interface SettingsRow {
  payload: string;
}

export function createSettingsRepository(
  namespace = "local",
): SettingsRepository {
  const databasePromise = openOrganaDatabase(namespace);
  return {
    async initialize() {
      await databasePromise;
    },
    async get() {
      const database = await databasePromise;
      const row = await database.getFirstAsync<SettingsRow>(
        "SELECT payload FROM user_settings WHERE id = 'user-settings'",
      );
      return row ? (JSON.parse(row.payload) as UserSettings) : null;
    },
    async upsert(settings) {
      const database = await databasePromise;
      await database.runAsync(
        `INSERT INTO user_settings (id, payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        settings.id,
        JSON.stringify(settings),
        settings.updatedAt,
      );
    },
  };
}
