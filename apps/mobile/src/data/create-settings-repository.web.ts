import { openOrganaDatabase } from "./organa-database.web";
import type { SettingsRepository } from "./settings-repository.types";

export function createSettingsRepository(
  namespace = "local",
): SettingsRepository {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async get() {
      const database = await openOrganaDatabase(namespace);
      return (await database.get("settings", "user-settings")) ?? null;
    },
    async upsert(settings) {
      const database = await openOrganaDatabase(namespace);
      await database.put("settings", settings);
    },
  };
}
