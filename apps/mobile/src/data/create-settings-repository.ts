import type { UserSettings } from "@organa/domain";

import type { SettingsRepository } from "./settings-repository.types";

const stores = new Map<string, UserSettings>();

export function createSettingsRepository(
  namespace = "local",
): SettingsRepository {
  return {
    async initialize() {},
    async get() {
      return stores.get(namespace) ?? null;
    },
    async upsert(settings) {
      stores.set(namespace, settings);
    },
  };
}
