import { openOrganaDatabase } from "./organa-database.web";
import type { SyncOutboxRepository } from "./sync-outbox.types";

export function createSyncOutboxRepository(
  namespace = "local",
): SyncOutboxRepository {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async list() {
      const database = await openOrganaDatabase(namespace);
      return database.getAllFromIndex("syncOutbox", "by-created-at");
    },
    async upsert(mutation) {
      const database = await openOrganaDatabase(namespace);
      await database.put("syncOutbox", mutation);
    },
    async remove(id) {
      const database = await openOrganaDatabase(namespace);
      await database.delete("syncOutbox", id);
    },
  };
}
