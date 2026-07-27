import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { createNotificationScheduler } from "./create-notification-scheduler";
import {
  notificationChannelEnabled,
  notificationPermissionGranted,
} from "./native-notification-status";
import { gentleReminderChannelId } from "./native-notification-plan";
import type { NotificationDeliveryCheckResult } from "./notification-delivery-check.types";

export async function sendNotificationDeliveryCheck(): Promise<NotificationDeliveryCheckResult> {
  await createNotificationScheduler().initialize();

  let permission = await Notifications.getPermissionsAsync();
  if (!notificationPermissionGranted(permission)) {
    permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
      },
    });
  }
  if (!notificationPermissionGranted(permission)) {
    return {
      message:
          Platform.OS === "android"
            ? "Android is still blocking Organa notifications. Enable notifications for Organa in system settings, then try again."
            : "Notifications are still blocked for Organa. Enable them in system settings, then try again.",
      status: "denied",
    };
  }
  if (!(await notificationChannelEnabled(gentleReminderChannelId))) {
    return {
      message:
        'Organa is allowed, but its "Gentle reminders" notification category is off. Enable that category in Android notification settings.',
      status: "channel_disabled",
    };
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      body: "If you can see this, Organa can reach this device.",
      data: { deliveryCheck: true },
      sound: false,
      title: "Organa test reminder",
      },
      trigger:
        Platform.OS === "android"
          ? { channelId: gentleReminderChannelId }
          : null,
  });
  return {
    message:
      "Test sent. It should appear immediately; Android may place this silent reminder in the notification shade.",
    status: "sent",
  };
}
