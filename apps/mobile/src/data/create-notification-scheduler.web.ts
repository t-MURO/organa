import type {
  NotificationCapability,
  NotificationScheduler,
} from "./notification-scheduler.types";

export const notificationCapability: NotificationCapability = {
  supported: false,
  label: "In-app reminder only",
  reason:
    "This browser build can nudge you only while Organa is open. Keep a mobile reminder device enabled for reminders when the tab is closed.",
};

export function createNotificationScheduler(): NotificationScheduler {
  return {
    capability: notificationCapability,
    async initialize() {},
    async syncTask() {
      return { permission: "unsupported", scheduled: 0 };
    },
    async cancelTask() {},
  };
}
