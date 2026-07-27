import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { notificationPermissionGranted } from "./native-notification-status";

export const deviceApprovalChannelId = "device-approvals";

export async function readApprovalPushToken() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(deviceApprovalChannelId, {
      description: "Alerts when another device asks to open your Organa space.",
      importance: Notifications.AndroidImportance.HIGH,
      name: "Device approvals",
      sound: null,
      vibrationPattern: [0, 180],
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  if (!notificationPermissionGranted(permission)) return undefined;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("The Expo project ID is unavailable.");
  }

  return (
    await Notifications.getExpoPushTokenAsync({
      projectId,
    })
  ).data;
}
