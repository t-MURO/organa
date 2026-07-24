import type { UserSettings } from "@organa/domain";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { CheckInReminderScheduler } from "./check-in-reminder-scheduler.types";

const identifier = "organa:daily-check-in";
const channelId = "gentle-check-in";

export const checkInReminderCapability = { supported: true };

export function createCheckInReminderScheduler(): CheckInReminderScheduler {
  return {
    capability: checkInReminderCapability,
    async initialize() {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(channelId, {
          description: "An optional, pressure-free evening Check-In.",
          importance: Notifications.AndroidImportance.DEFAULT,
          name: "Evening Check-In",
          sound: null,
        });
      }
    },
    async sync(settings, requestPermission = false) {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      if (!settings.checkInReminder.enabled) {
        return { permission: "not_requested", scheduled: false };
      }
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted && requestPermission) {
        permission = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: false, allowSound: false },
        });
      }
      if (!isGranted(permission)) {
        return {
          permission: requestPermission ? "denied" : "not_requested",
          scheduled: false,
        };
      }

      const [hour, minute] = settings.checkInReminder.time
        .split(":")
        .map(Number);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          body: "A few words are enough. Skipping is okay too.",
          data: { route: "/check-in" },
          sound: false,
          title: "A gentle evening Check-In",
        },
        trigger: {
          channelId,
          hour,
          minute,
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
        },
      });
      return { permission: "granted", scheduled: true };
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
