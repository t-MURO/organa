import type { CheckInEntry } from "@organa/domain";

export interface CheckInRepository {
  initialize(): Promise<void>;
  list(): Promise<CheckInEntry[]>;
  remove(id: string): Promise<void>;
  upsert(entry: CheckInEntry): Promise<void>;
}
