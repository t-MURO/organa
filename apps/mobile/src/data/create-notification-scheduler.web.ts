import type {
  NotificationCapability,
  NotificationScheduler,
} from "./notification-scheduler.types";
import {
  buildTaskWebPushSchedule,
  taskWebPushScope,
} from "./web-push-plan";
import {
  flushPendingSchedules,
  initializeWebPushScheduler,
  syncWebPushSchedule,
  webPushConfigured,
} from "./web-push-scheduler.web";

export const notificationCapability: NotificationCapability = {
  supported: webPushConfigured,
  label: webPushConfigured
    ? "System and in-app reminders"
    : "In-app reminder only",
  reason: webPushConfigured
    ? "Organa asks for browser permission only when you save a reminder. If Push is unavailable or blocked, reminders still appear while Organa is open."
    : "System Web Push is not configured for this build. Reminders appear while Organa is open; keep a mobile reminder device enabled for closed-tab delivery.",
};

export function createNotificationScheduler(): NotificationScheduler {
  return {
    capability: notificationCapability,
    async initialize() {
      initializeWebPushScheduler();
      void flushPendingSchedules(false).catch(() => undefined);
    },
    async syncTask(task, requestPermission = false) {
      const schedule = buildTaskWebPushSchedule(task);
      const permission = await syncWebPushSchedule(
        schedule,
        requestPermission && schedule.entries.length > 0,
      );
      return {
        permission,
        scheduled: permission === "granted" ? schedule.entries.length : 0,
      };
    },
    async cancelTask(taskId) {
      await syncWebPushSchedule({
        entries: [],
        scope: taskWebPushScope(taskId),
      });
    },
  };
}
