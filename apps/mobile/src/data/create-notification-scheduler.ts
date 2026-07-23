import type {
  NotificationCapability,
  NotificationScheduler,
} from "./notification-scheduler.types";

export const notificationCapability: NotificationCapability = {
  supported: false,
  label: "In-app reminder",
  reason: "System notifications are unavailable in this environment.",
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
