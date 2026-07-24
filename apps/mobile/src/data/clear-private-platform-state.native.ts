import * as Notifications from "expo-notifications";

import { clearNotificationPrivateState } from "./notification-private-state";

export async function clearPrivatePlatformState() {
  await clearNotificationPrivateState().catch(() =>
    Promise.allSettled([
      Promise.resolve().then(() =>
        Notifications.clearLastNotificationResponse(),
      ),
      Notifications.cancelAllScheduledNotificationsAsync(),
      Notifications.dismissAllNotificationsAsync(),
    ]),
  );
}
