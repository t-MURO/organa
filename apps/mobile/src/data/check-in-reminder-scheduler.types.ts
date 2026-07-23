import type { UserSettings } from "@organa/domain";

export interface CheckInReminderCapability {
  supported: boolean;
  reason?: string;
}

export interface CheckInReminderScheduler {
  capability: CheckInReminderCapability;
  initialize(): Promise<void>;
  sync(settings: UserSettings, requestPermission?: boolean): Promise<boolean>;
}
