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
import { createSettingsRepository } from "../../data/create-settings-repository";
import { useSync } from "../../sync/sync-context";
import { useDevices } from "../account/device-context";

interface SettingsContextValue {
  loading: boolean;
  settings: UserSettings;
  restore(settings: UserSettings): Promise<void>;
  update(input: UserSettingsInput): UserSettings;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);
const reminderScheduler = createCheckInReminderScheduler();

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

  useEffect(() => {
    let active = true;
    void repository.initialize().then(async () => {
      const stored = (await repository.get()) ?? createUserSettings();
      if (!active) return;
      setSettings(stored);
      setLoading(false);
      void reminderScheduler.initialize().then(() =>
        reminderScheduler.sync(reminderSettings(stored, devices.remindersAllowed)),
      );
    });
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    void reminderScheduler.sync(
      reminderSettings(settings, devices.remindersAllowed),
    );
  }, [devices.remindersAllowed]);

  useEffect(
    () =>
      sync.subscribe<UserSettings>("settings", (change) => {
        if (change.operation === "delete" || !change.value) return;
        setSettings(change.value);
        void repository.upsert(change.value);
        void reminderScheduler.sync(
          reminderSettings(change.value, devices.remindersAllowed),
        );
      }),
    [devices.remindersAllowed, repository],
  );

  function update(input: UserSettingsInput) {
    const next = updateUserSettings(settings, input);
    setSettings(next);
    void repository.upsert(next);
    void sync.queueUpsert("settings", next.id, next, settings);
    void reminderScheduler.sync(
      reminderSettings(next, devices.remindersAllowed),
      Boolean(input.checkInReminder?.enabled) && devices.remindersAllowed,
    );
    return next;
  }

  async function restore(next: UserSettings) {
    await repository.upsert(next);
    await sync.queueUpsert("settings", next.id, next, settings);
    setSettings(next);
    await reminderScheduler.sync(
      reminderSettings(next, devices.remindersAllowed),
      next.checkInReminder.enabled && devices.remindersAllowed,
    );
  }

  return (
    <SettingsContext.Provider value={{ loading, restore, settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
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
