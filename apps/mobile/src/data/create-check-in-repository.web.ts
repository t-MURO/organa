import type { CheckInEntry } from "@organa/domain";

import type { CheckInRepository } from "./check-in-repository.types";
import { openOrganaDatabase } from "./organa-database.web";

export function createCheckInRepository(): CheckInRepository {
  return {
    async initialize() {
      await openOrganaDatabase();
    },
    async list() {
      const database = await openOrganaDatabase();
      return database.getAllFromIndex("checkIns", "by-date");
    },
    async upsert(entry: CheckInEntry) {
      const database = await openOrganaDatabase();
      await database.put("checkIns", entry);
    },
  };
}
