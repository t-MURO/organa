import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  buildNativeTaskNotificationPlan,
  gentleReminderChannelId,
} from "./native-notification-plan";
import {
  notificationChannelEnabled,
  notificationPermissionGranted,
} from "./native-notification-status";
import type {
  NotificationCapability,
  NotificationScheduler,
  NotificationSyncResult,
} from "./notification-scheduler.types";

export const notificationCapability: NotificationCapability = {
  supported: true,
  label: "Offline device notification",
};

export function createNotificationScheduler(): NotificationScheduler {
  return {
    capability: notificationCapability,
    async initialize() {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(
          gentleReminderChannelId,
          {
            description: "Pressure-free task reminders from Organa.",
            importance: Notifications.AndroidImportance.DEFAULT,
            name: "Gentle reminders",
            sound: null,
            vibrationPattern: [0, 180],
          },
        );
      }
    },
    async syncTask(task, requestPermission = false) {
      await cancelTaskNotifications(task.id);
      const plan = buildNativeTaskNotificationPlan(task);
      if (plan.requests.length === 0) {
        return { permission: "not_requested", scheduled: 0 };
      }

      const permission = await resolvePermission(requestPermission);
      if (permission !== "granted") {
        return { permission, scheduled: 0 };
      }
      if (!(await notificationChannelEnabled(gentleReminderChannelId))) {
        return { permission: "denied", scheduled: 0 };
      }

      await Notifications.setNotificationCategoryAsync(
        plan.category.identifier,
        plan.category.actions.map((action) => ({
          buttonTitle: action.buttonTitle,
          identifier: action.identifier,
          options: {
            opensAppToForeground: action.opensAppToForeground,
          },
        })),
      );

      await Promise.all(
        plan.requests.map((request) =>
          Notifications.scheduleNotificationAsync({
            content: request.content,
            identifier: request.identifier,
            trigger: {
              channelId: gentleReminderChannelId,
              date: request.triggerAt,
              type: Notifications.SchedulableTriggerInputTypes.DATE,
            },
          }),
        ),
      );
      await verifyScheduledNotifications(
        plan.requests.map((request) => request.identifier),
      );

      return {
        permission: "granted",
        scheduled: plan.requests.length,
      };
    },
    cancelTask: cancelTaskNotifications,
  };
}

async function resolvePermission(
  requestPermission: boolean,
): Promise<NotificationSyncResult["permission"]> {
  let settings = await Notifications.getPermissionsAsync();
  if (!notificationPermissionGranted(settings) && requestPermission) {
    settings = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
      },
    });
  }
  if (notificationPermissionGranted(settings)) return "granted";
  return requestPermission ? "denied" : "not_requested";
}

async function verifyScheduledNotifications(identifiers: string[]) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledIds = new Set(
    scheduled.map((notification) => notification.identifier),
  );
  if (identifiers.some((identifier) => !scheduledIds.has(identifier))) {
    throw new Error("The device did not retain every scheduled task reminder.");
  }
}

async function cancelTaskNotifications(taskId: string) {
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync(),
  ]);
  const matchingScheduled = scheduled.filter(
    (request) => request.content.data?.taskId === taskId,
  );
  const matchingPresented = presented.filter(
    (notification) => notification.request.content.data?.taskId === taskId,
  );
  await Promise.all(
    [
      ...matchingScheduled.map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
      ...matchingPresented.map((notification) =>
        Notifications.dismissNotificationAsync(
          notification.request.identifier,
        ),
      ),
    ],
  );
}
