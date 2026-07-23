import type { CheckInEntry } from "@organa/domain";

import type { CheckInRepository } from "./check-in-repository.types";
import { openOrganaDatabase } from "./organa-database.web";

export function createCheckInRepository(namespace = "local"): CheckInRepository {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async list() {
      const database = await openOrganaDatabase(namespace);
      return database.getAllFromIndex("checkIns", "by-date");
    },
    async upsert(entry: CheckInEntry) {
      const database = await openOrganaDatabase(namespace);
      await database.put("checkIns", entry);
    },
  };
}
