import type { CheckInReminderScheduler } from "./check-in-reminder-scheduler.types";

export const checkInReminderCapability = {
  supported: false,
  reason: "System Check-In reminders are unavailable in this environment.",
};

export function createCheckInReminderScheduler(): CheckInReminderScheduler {
  return {
    capability: checkInReminderCapability,
    async initialize() {},
    async sync(settings) {
      return {
        permission: settings.checkInReminder.enabled
          ? ("unsupported" as const)
          : ("not_requested" as const),
        scheduled: false,
      };
    },
  };
}
