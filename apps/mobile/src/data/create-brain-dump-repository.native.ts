import type { BrainDumpBullet } from "@organa/domain";

import type { BrainDumpRepository } from "./brain-dump-repository.types";
import { openOrganaDatabase } from "./organa-database.native";

interface BrainDumpRow {
  payload: string;
}

export function createBrainDumpRepository(
  namespace = "local",
): BrainDumpRepository {
  const databasePromise = openOrganaDatabase(namespace);

  return {
    async initialize() {
      await databasePromise;
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
