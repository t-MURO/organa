import {
  createUserSettings,
  updateUserSettings,
  type UserSettings,
  type UserSettingsInput,
} from "@organa/domain";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "../../auth/auth-context";
import { createCheckInReminderScheduler } from "../../data/create-check-in-reminder-scheduler";
import type { CheckInReminderSyncResult } from "../../data/check-in-reminder-scheduler.types";
import { createSettingsRepository } from "../../data/create-settings-repository";
import { useSync } from "../../sync/sync-context";
import { useDevices } from "../account/device-context";

interface SettingsContextValue {
  checkInReminderNotice: string;
  clearCheckInReminderNotice(): void;
  loading: boolean;
  settings: UserSettings;
  restore(settings: UserSettings): Promise<void>;
  update(input: UserSettingsInput): UserSettings;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);
const reminderScheduler = createCheckInReminderScheduler();
let reminderInitialization: Promise<void> | undefined;

function initializeReminderScheduler() {
  reminderInitialization ??= reminderScheduler.initialize().catch(
    (error: unknown) => {
      reminderInitialization = undefined;
      throw error;
    },
  );
  return reminderInitialization;
}

async function syncCheckInReminder(
  settings: UserSettings,
  requestPermission: boolean,
  report: (message: string) => void,
) {
  try {
    await initializeReminderScheduler();
    const result = await reminderScheduler.sync(settings, requestPermission);
    if (!settings.checkInReminder.enabled) return;
    const notice = checkInReminderNoticeFor(result);
    if (notice) report(notice);
  } catch {
    report(
      settings.checkInReminder.enabled
        ? "Your Check-In reminder was saved, but this device could not schedule it. Check system notification settings before relying on it."
        : "Organa could not remove the previous Check-In reminder. Check system notification settings before relying on its schedule.",
    );
  }
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const sync = useSync();
  const devices = useDevices();
  const namespace = auth.user?.id ?? "local-preview";
  const repository = useMemo(
    () => createSettingsRepository(namespace),
    [namespace],
  );
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(() => createUserSettings());
  const settingsRef = useRef(settings);
  const [checkInReminderNotice, setCheckInReminderNotice] = useState("");

  useEffect(() => {
    setCheckInReminderNotice("");
  }, [namespace]);

  useEffect(() => {
    let active = true;
    void repository.initialize().then(async () => {
      const stored = mergeSettingsPatch(
        createUserSettings(),
        (await repository.get()) ?? {},
      );
      if (!active) return;
      settingsRef.current = stored;
      setSettings(stored);
      setLoading(false);
      if (devices.reminderAuthorizationReady) {
        void syncCheckInReminder(
          reminderSettings(stored, devices.remindersAllowed),
          false,
          setCheckInReminderNotice,
        );
      }
    });
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!devices.reminderAuthorizationReady) return;
    void syncCheckInReminder(
      reminderSettings(settings, devices.remindersAllowed),
      false,
      setCheckInReminderNotice,
    );
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
  ]);

  useEffect(
    () =>
      sync.subscribe<Partial<UserSettings>>("settings", (change) => {
        if (change.operation === "delete" || !change.value) return;
        const next = mergeSettingsPatch(settingsRef.current, change.value);
        settingsRef.current = next;
        setSettings(next);
        void repository.upsert(next);
        if (devices.reminderAuthorizationReady) {
          void syncCheckInReminder(
            reminderSettings(next, devices.remindersAllowed),
            false,
            setCheckInReminderNotice,
          );
        }
      }),
    [
      devices.reminderAuthorizationReady,
      devices.remindersAllowed,
      repository,
    ],
  );

  function update(input: UserSettingsInput) {
    const previous = settingsRef.current;
    const next = updateUserSettings(previous, input);
    settingsRef.current = next;
    setSettings(next);
    void sync.commitUpsert("settings", next.id, next, previous);
    if (devices.reminderAuthorizationReady) {
      void syncCheckInReminder(
        reminderSettings(next, devices.remindersAllowed),
        Boolean(input.checkInReminder?.enabled) && devices.remindersAllowed,
        setCheckInReminderNotice,
      );
    }
    return next;
  }

  async function restore(next: UserSettings) {
    const previous = settingsRef.current;
    const committed = await sync.commitUpsert(
      "settings",
      next.id,
      next,
      previous,
    );
    if (!committed) {
      throw new Error("The restored settings could not be saved.");
    }
    settingsRef.current = next;
    setSettings(next);
    if (devices.reminderAuthorizationReady) {
      await syncCheckInReminder(
        reminderSettings(next, devices.remindersAllowed),
        next.checkInReminder.enabled && devices.remindersAllowed,
        setCheckInReminderNotice,
      );
    }
  }

  return (
    <SettingsContext.Provider
      value={{
        checkInReminderNotice,
        clearCheckInReminderNotice: () => setCheckInReminderNotice(""),
        loading,
        restore,
        settings,
        update,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

function checkInReminderNoticeFor(result: CheckInReminderSyncResult) {
  if (result.permission === "not_requested") {
    return "Your Check-In reminder is saved, but system notification permission has not been granted. Toggle it off and on when you are ready to allow reminders.";
  }
  if (result.permission === "denied") {
    return "Your Check-In reminder is saved, but system reminders are off. Enable notifications in device or browser settings before relying on it.";
  }
  if (result.permission === "unsupported") {
    return "This app cannot deliver a closed-app Check-In reminder here. Keep Organa open near the selected time or use a reminder-enabled device.";
  }
  if (!result.scheduled) {
    return "Your Check-In reminder is enabled, but no system notification could be scheduled.";
  }
  return "";
}

function reminderSettings(settings: UserSettings, allowed: boolean) {
  return allowed
    ? settings
    : {
        ...settings,
        checkInReminder: { ...settings.checkInReminder, enabled: false },
      };
}

function mergeSettingsPatch(
  current: UserSettings,
  patch: Partial<UserSettings>,
): UserSettings {
  const checkInReminder =
    patch.checkInReminder &&
    typeof patch.checkInReminder.enabled === "boolean" &&
    isLocalTime(patch.checkInReminder.time)
      ? patch.checkInReminder
      : current.checkInReminder;

  return {
    appSoundsEnabled:
      typeof patch.appSoundsEnabled === "boolean"
        ? patch.appSoundsEnabled
        : current.appSoundsEnabled,
    checkInReminder,
    createdAt: isTimestamp(patch.createdAt)
      ? patch.createdAt
      : current.createdAt,
    hapticsEnabled:
      typeof patch.hapticsEnabled === "boolean"
        ? patch.hapticsEnabled
        : current.hapticsEnabled,
    id: "user-settings",
    theme:
      patch.theme === "system" ||
      patch.theme === "light" ||
      patch.theme === "dark"
        ? patch.theme
        : current.theme,
    updatedAt: isTimestamp(patch.updatedAt)
      ? patch.updatedAt
      : current.updatedAt,
  };
}

function isLocalTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider.");
  }
  return context;
}
