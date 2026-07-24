import * as Notifications from "expo-notifications";

export async function clearPrivatePlatformState() {
  await Promise.allSettled([
    Promise.resolve().then(() =>
      Notifications.clearLastNotificationResponse(),
    ),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}
