import type { UserSettings } from "@organa/domain";

export interface SettingsRepository {
  initialize(): Promise<void>;
  get(): Promise<UserSettings | null>;
  upsert(settings: UserSettings): Promise<void>;
}
