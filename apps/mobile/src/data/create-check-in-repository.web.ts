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
    async remove(id: string) {
      const database = await openOrganaDatabase(namespace);
      await database.delete("checkIns", id);
    },
    async upsert(entry: CheckInEntry) {
      const database = await openOrganaDatabase(namespace);
      const transaction = database.transaction("checkIns", "readwrite");
      const store = transaction.objectStore("checkIns");
      const previousId = await store.index("by-date").getKey(entry.date);
      if (previousId && previousId !== entry.id) {
        await store.delete(previousId);
      }
      await store.put(entry);
      await transaction.done;
    },
  };
}
