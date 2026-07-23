import type { CheckInEntry } from "@organa/domain";

export interface CheckInRepository {
  initialize(): Promise<void>;
  list(): Promise<CheckInEntry[]>;
  upsert(entry: CheckInEntry): Promise<void>;
}
