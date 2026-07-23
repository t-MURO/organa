export type ThemePreference = "system" | "light" | "dark";

export interface CheckInReminderSettings {
  enabled: boolean;
  time: string;
}

export interface UserSettings {
  id: "user-settings";
  theme: ThemePreference;
  appSoundsEnabled: boolean;
  hapticsEnabled: boolean;
  checkInReminder: CheckInReminderSettings;
  createdAt: string;
  updatedAt: string;
}

export type UserSettingsInput = Partial<
  Pick<
    UserSettings,
    "theme" | "appSoundsEnabled" | "hapticsEnabled" | "checkInReminder"
  >
>;

export function createUserSettings(
  input: UserSettingsInput = {},
  now = new Date(),
): UserSettings {
  const timestamp = now.toISOString();
  return {
    appSoundsEnabled: input.appSoundsEnabled ?? false,
    checkInReminder: normalizeCheckInReminder(input.checkInReminder),
    createdAt: timestamp,
    hapticsEnabled: input.hapticsEnabled ?? true,
    id: "user-settings",
    theme: input.theme ?? "system",
    updatedAt: timestamp,
  };
}

export function updateUserSettings(
  settings: UserSettings,
  input: UserSettingsInput,
  now = new Date(),
): UserSettings {
  return {
    ...settings,
    ...input,
    checkInReminder: input.checkInReminder
      ? normalizeCheckInReminder(input.checkInReminder)
      : settings.checkInReminder,
    id: "user-settings",
    updatedAt: now.toISOString(),
  };
}

function normalizeCheckInReminder(
  reminder?: CheckInReminderSettings,
): CheckInReminderSettings {
  const time = reminder?.time ?? "20:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Check-In reminder time must use HH:MM.");
  }
  return { enabled: reminder?.enabled ?? false, time };
}
