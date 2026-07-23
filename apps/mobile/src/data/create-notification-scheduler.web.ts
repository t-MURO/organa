import type {
  NotificationCapability,
  NotificationScheduler,
} from "./notification-scheduler.types";

export const notificationCapability: NotificationCapability = {
  supported: false,
  label: "In-app reminder only",
  reason:
    "Browser system notifications are not enabled yet. Your reminder settings are saved and visible in Organa.",
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
