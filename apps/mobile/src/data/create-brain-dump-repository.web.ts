import type { BrainDumpBullet } from "@organa/domain";

import type { BrainDumpRepository } from "./brain-dump-repository.types";
import { openOrganaDatabase } from "./organa-database.web";

export function createBrainDumpRepository(
  namespace = "local",
): BrainDumpRepository {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async list() {
      const database = await openOrganaDatabase(namespace);
      return database.getAllFromIndex("brainDumpBullets", "by-rank");
    },
    async upsert(bullet: BrainDumpBullet) {
      const database = await openOrganaDatabase(namespace);
      await database.put("brainDumpBullets", bullet);
    },
    async remove(id: string) {
      const database = await openOrganaDatabase(namespace);
      await database.delete("brainDumpBullets", id);
    },
  };
}
