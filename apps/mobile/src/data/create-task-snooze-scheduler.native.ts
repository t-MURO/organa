import * as Notifications from "expo-notifications";

import {
  buildNativeTaskNotificationPlan,
  createNativeTaskSnoozeContent,
  gentleReminderChannelId,
} from "./native-notification-plan";
import type { TaskSnoozeScheduler } from "./task-snooze-scheduler.types";

export function createTaskSnoozeScheduler(): TaskSnoozeScheduler {
  return {
    async schedule(task, minutes) {
      if (!task.snoozePresets.includes(minutes)) {
        throw new Error("The snooze preset is not available for this task.");
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!isGranted(permission)) {
        permission = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: false, allowSound: false },
        });
      }
      if (!isGranted(permission)) return { delivery: "unsupported" };

      const category = buildNativeTaskNotificationPlan(task).category;
      await Notifications.setNotificationCategoryAsync(
        category.identifier,
        category.actions.map((action) => ({
          buttonTitle: action.buttonTitle,
          identifier: action.identifier,
          options: {
            opensAppToForeground: action.opensAppToForeground,
          },
        })),
      );
      await Notifications.scheduleNotificationAsync({
        content: createNativeTaskSnoozeContent(task),
        trigger: {
          channelId: gentleReminderChannelId,
          seconds: minutes * 60,
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        },
      });
      return { delivery: "system" };
    },
  };
}

function isGranted(settings: Notifications.NotificationPermissionsStatus) {
  return (
    settings.granted ||
    settings.ios?.status ===
      Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}
