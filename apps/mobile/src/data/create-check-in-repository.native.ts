import type { CheckInEntry } from "@organa/domain";

import type { CheckInRepository } from "./check-in-repository.types";
import { openOrganaDatabase } from "./organa-database.native";

interface CheckInRow {
  payload: string;
}

export function createCheckInRepository(
  namespace = "local",
): CheckInRepository {
  const databasePromise = openOrganaDatabase(namespace);

  return {
    async initialize() {
      await databasePromise;
    },
    async list() {
      const database = await databasePromise;
      const rows = await database.getAllAsync<CheckInRow>(
        "SELECT payload FROM check_ins ORDER BY entry_date DESC",
      );
      return rows.map((row) => JSON.parse(row.payload) as CheckInEntry);
    },
    async remove(id) {
      const database = await databasePromise;
      await database.runAsync("DELETE FROM check_ins WHERE id = ?", id);
    },
    async upsert(entry) {
      const database = await databasePromise;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          "DELETE FROM check_ins WHERE entry_date = ? AND id <> ?",
          entry.date,
          entry.id,
        );
        await transaction.runAsync(
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
      });
    },
  };
}
