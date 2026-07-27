import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export function notificationPermissionGranted(
  settings: Notifications.NotificationPermissionsStatus,
) {
  return (
    settings.granted ||
    settings.ios?.status ===
      Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function notificationChannelEnabled(channelId: string) {
  if (Platform.OS !== "android" || Number(Platform.Version) < 26) return true;
  const channel = await Notifications.getNotificationChannelAsync(channelId);
  return Boolean(
    channel && channel.importance !== Notifications.AndroidImportance.NONE,
  );
}
