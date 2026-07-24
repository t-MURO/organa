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
  const [checkInReminderNotice, setCheckInReminderNotice] = useState("");

  useEffect(() => {
    setCheckInReminderNotice("");
  }, [namespace]);

  useEffect(() => {
    let active = true;
    void repository.initialize().then(async () => {
      const stored = (await repository.get()) ?? createUserSettings();
      if (!active) return;
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
      sync.subscribe<UserSettings>("settings", (change) => {
        if (change.operation === "delete" || !change.value) return;
        setSettings(change.value);
        void repository.upsert(change.value);
        if (devices.reminderAuthorizationReady) {
          void syncCheckInReminder(
            reminderSettings(change.value, devices.remindersAllowed),
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
    const next = updateUserSettings(settings, input);
    setSettings(next);
    void repository.upsert(next);
    void sync.queueUpsert("settings", next.id, next, settings);
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
    await repository.upsert(next);
    await sync.queueUpsert("settings", next.id, next, settings);
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

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used inside SettingsProvider.");
  }
  return context;
}
