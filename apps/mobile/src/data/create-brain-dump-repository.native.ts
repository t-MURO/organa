import type { BrainDumpBullet } from "@organa/domain";
import * as SQLite from "expo-sqlite";

import type { BrainDumpRepository } from "./brain-dump-repository.types";

interface BrainDumpRow {
  payload: string;
}

export function createBrainDumpRepository(): BrainDumpRepository {
  const databasePromise = SQLite.openDatabaseAsync("organa.db");

  return {
    async initialize() {
      const database = await databasePromise;
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS brain_dump_bullets (
          id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          rank REAL NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
    async list() {
      const database = await databasePromise;
      const rows = await database.getAllAsync<BrainDumpRow>(
        "SELECT payload FROM brain_dump_bullets ORDER BY rank ASC",
      );
      return rows.map((row) => JSON.parse(row.payload) as BrainDumpBullet);
    },
    async upsert(bullet) {
      const database = await databasePromise;
      await database.runAsync(
        `INSERT INTO brain_dump_bullets (id, payload, rank, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           rank = excluded.rank,
           updated_at = excluded.updated_at`,
        bullet.id,
        JSON.stringify(bullet),
        bullet.rank,
        bullet.updatedAt,
      );
    },
    async remove(id) {
      const database = await databasePromise;
      await database.runAsync(
        "DELETE FROM brain_dump_bullets WHERE id = ?",
        id,
      );
    },
  };
}
