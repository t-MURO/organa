import type { CheckInReminderScheduler } from "./check-in-reminder-scheduler.types";

export const checkInReminderCapability = {
  supported: false,
  reason:
    "The web reminder appears only while Organa is open. Keep a mobile reminder device enabled if you want a nudge when the tab is closed.",
};

export function createCheckInReminderScheduler(): CheckInReminderScheduler {
  return {
    capability: checkInReminderCapability,
    async initialize() {},
    async sync() {
      return false;
    },
  };
}
