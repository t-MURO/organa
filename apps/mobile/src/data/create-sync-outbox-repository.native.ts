import * as SQLite from "expo-sqlite";

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
  const databasePromise = SQLite.openDatabaseAsync(databaseName(namespace));
  return {
    async initialize() {
      const database = await databasePromise;
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS sync_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
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

function databaseName(namespace: string) {
  return `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
}
