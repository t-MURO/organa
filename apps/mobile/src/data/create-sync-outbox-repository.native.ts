import { openOrganaDatabase } from "./organa-database.native";
import type {
  EncryptedMutation,
  SyncOutboxRepository,
} from "./sync-outbox.types";

interface OutboxRow {
  payload: string;
}

export function createSyncOutboxRepository(
  namespace = "local",
): SyncOutboxRepository {
  const databasePromise = openOrganaDatabase(namespace);
  return {
    async initialize() {
      await databasePromise;
    },
    async list() {
      const database = await databasePromise;
      const rows = await database.getAllAsync<OutboxRow>(
        "SELECT payload FROM sync_outbox ORDER BY created_at ASC",
      );
      return rows.map(
        (row) => JSON.parse(row.payload) as EncryptedMutation,
      );
    },
    async upsert(mutation) {
      const database = await databasePromise;
      await database.runAsync(
        `INSERT INTO sync_outbox (id, payload, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
        mutation.id,
        JSON.stringify(mutation),
        mutation.createdAt,
      );
    },
    async remove(id) {
      const database = await databasePromise;
      await database.runAsync("DELETE FROM sync_outbox WHERE id = ?", id);
    },
  };
}
