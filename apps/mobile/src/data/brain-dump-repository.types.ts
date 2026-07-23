import type { BrainDumpBullet } from "@organa/domain";

export interface BrainDumpRepository {
  initialize(): Promise<void>;
  list(): Promise<BrainDumpBullet[]>;
  upsert(bullet: BrainDumpBullet): Promise<void>;
  remove(id: string): Promise<void>;
}
