import type { CheckInReminderScheduler } from "./check-in-reminder-scheduler.types";
import { buildCheckInWebPushSchedule } from "./web-push-plan";
import {
  flushPendingSchedules,
  initializeWebPushScheduler,
  syncWebPushSchedule,
  webPushConfigured,
} from "./web-push-scheduler.web";

export const checkInReminderCapability = {
  supported: webPushConfigured,
  reason: webPushConfigured
    ? "With permission, the browser can show this gentle reminder while Organa is closed. The open app remains the fallback."
    : "System Web Push is not configured for this build. The reminder appears only while Organa is open.",
};

export function createCheckInReminderScheduler(): CheckInReminderScheduler {
  return {
    capability: checkInReminderCapability,
    async initialize() {
      initializeWebPushScheduler();
      void flushPendingSchedules(false).catch(() => undefined);
    },
    async sync(settings, requestPermission = false) {
      const schedule = buildCheckInWebPushSchedule(settings);
      const permission = await syncWebPushSchedule(
        schedule,
        requestPermission && schedule.entries.length > 0,
      );
      return {
        permission,
        scheduled:
          permission === "granted" && schedule.entries.length > 0,
      };
    },
  };
}
