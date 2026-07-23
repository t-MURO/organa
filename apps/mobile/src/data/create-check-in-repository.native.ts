import type { CheckInEntry } from "@organa/domain";
import * as SQLite from "expo-sqlite";

import type { CheckInRepository } from "./check-in-repository.types";

interface CheckInRow {
  payload: string;
}

export function createCheckInRepository(
  namespace = "local",
): CheckInRepository {
  const databasePromise = SQLite.openDatabaseAsync(databaseName(namespace));

  return {
    async initialize() {
      const database = await databasePromise;
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS check_ins (
          id TEXT PRIMARY KEY NOT NULL,
          entry_date TEXT UNIQUE NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
    async list() {
      const database = await databasePromise;
      const rows = await database.getAllAsync<CheckInRow>(
        "SELECT payload FROM check_ins ORDER BY entry_date DESC",
      );
      return rows.map((row) => JSON.parse(row.payload) as CheckInEntry);
    },
    async upsert(entry) {
      const database = await databasePromise;
      await database.runAsync(
        `INSERT INTO check_ins (id, entry_date, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           entry_date = excluded.entry_date,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        entry.id,
        entry.date,
        JSON.stringify(entry),
        entry.updatedAt,
      );
    },
  };
}

function databaseName(namespace: string) {
  return `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
}
