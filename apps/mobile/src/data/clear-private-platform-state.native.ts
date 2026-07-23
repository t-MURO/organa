import * as Notifications from "expo-notifications";

export async function clearPrivatePlatformState() {
  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}
