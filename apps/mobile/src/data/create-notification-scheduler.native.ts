import {
  buildSubtaskReminderSchedule,
  buildTaskReminderSchedule,
  type Task,
} from "@organa/domain";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type {
  NotificationCapability,
  NotificationScheduler,
  NotificationSyncResult,
} from "./notification-scheduler.types";

const channelId = "gentle-reminders";

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
        await Notifications.setNotificationChannelAsync(channelId, {
          description: "Pressure-free task reminders from Organa.",
          importance: Notifications.AndroidImportance.DEFAULT,
          name: "Gentle reminders",
          sound: null,
          vibrationPattern: [0, 180],
        });
      }
    },
    async syncTask(task, requestPermission = false) {
      await cancelTaskNotifications(task.id);
      const schedule = buildTaskReminderSchedule(task);
      const subtaskSchedule = buildSubtaskReminderSchedule(task);
      if (schedule.length === 0) {
        return { permission: "not_requested", scheduled: 0 };
      }

      const permission = await resolvePermission(requestPermission);
      if (permission !== "granted") {
        return { permission, scheduled: 0 };
      }

      const categoryIdentifier = categoryId(task.id);
      await Notifications.setNotificationCategoryAsync(
        categoryIdentifier,
        [
          {
            buttonTitle: "Focus",
            identifier: "focus",
            options: { opensAppToForeground: true },
          },
          ...task.snoozePresets.slice(0, 2).map((minutes) => ({
            buttonTitle: `Snooze ${minutes}m`,
            identifier: `snooze-${minutes}`,
            options: { opensAppToForeground: false },
          })),
        ],
      );

      await Promise.all(
        [
          ...schedule.map(({ reminder, triggerAt }) => ({
            identifier: notificationId(task.id, reminder.id),
            content: {
              body: task.title,
              categoryIdentifier,
              data: {
                taskId: task.id,
                taskTitle: task.title,
                snoozePresets: task.snoozePresets,
              },
              sound: false,
              subtitle: reminderSubtitle(reminder.stage),
              title: reminderTitle(reminder.stage),
            },
            trigger: {
              channelId,
              date: triggerAt,
              type: Notifications.SchedulableTriggerInputTypes.DATE,
            },
          })),
          ...subtaskSchedule.map(
            ({ reminder, subtaskId, subtaskTitle, triggerAt }) => ({
              identifier: notificationId(
                task.id,
                `${reminder.id}:subtask:${subtaskId}`,
              ),
              content: {
                body: subtaskTitle,
                categoryIdentifier,
                data: {
                  subtaskId,
                  taskId: task.id,
                  taskTitle: task.title,
                },
                sound: false,
                subtitle: task.title,
                title: "A next step is ready",
              },
              trigger: {
                channelId,
                date: triggerAt,
                type: Notifications.SchedulableTriggerInputTypes.DATE,
              },
            }),
          ),
        ].map((request) =>
          Notifications.scheduleNotificationAsync(request),
        ),
      );

      return {
        permission: "granted",
        scheduled: schedule.length + subtaskSchedule.length,
      };
    },
    cancelTask: cancelTaskNotifications,
  };
}

async function resolvePermission(
  requestPermission: boolean,
): Promise<NotificationSyncResult["permission"]> {
  let settings = await Notifications.getPermissionsAsync();
  if (!isGranted(settings) && requestPermission) {
    settings = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
      },
    });
  }
  if (isGranted(settings)) return "granted";
  return requestPermission ? "denied" : "not_requested";
}

function isGranted(settings: Notifications.NotificationPermissionsStatus) {
  return (
    settings.granted ||
    settings.ios?.status ===
      Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function cancelTaskNotifications(taskId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const matching = scheduled.filter(
    (request) => request.content.data?.taskId === taskId,
  );
  await Promise.all(
    matching.map((request) =>
      Notifications.cancelScheduledNotificationAsync(request.identifier),
    ),
  );
}

function categoryId(taskId: string) {
  return `organa-${taskId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function notificationId(taskId: string, reminderId: string) {
  return `organa:${taskId}:${reminderId}`;
}

function reminderTitle(stage: Task["reminders"][number]["stage"]) {
  if (stage === "before_due") return "Coming up gently";
  if (stage === "after_due") return "A gentle follow-up";
  return "Ready when you are";
}

function reminderSubtitle(stage: Task["reminders"][number]["stage"]) {
  if (stage === "before_due") return "Before its due time";
  if (stage === "after_due") return "After its due time";
  return "Due now";
}
