import {
  clearPendingWebPushSchedules,
  removeCurrentWebPushSubscription,
} from "./web-push-scheduler.web";
import { clearPendingTaskSnoozes } from "./create-task-snooze-scheduler.web";
import { clearShownReminderHistory } from "./in-app-reminder-history.web";
import { clearNotificationPrivateState } from "./notification-private-state";

export async function clearPrivatePlatformState() {
  await clearNotificationPrivateState().catch(async () => {
    clearPendingWebPushSchedules();
    clearPendingTaskSnoozes();
    clearShownReminderHistory();
    await removeCurrentWebPushSubscription().catch(() => undefined);
    clearPendingWebPushSchedules();
    clearPendingTaskSnoozes();
    clearShownReminderHistory();
  });
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker
    .getRegistration()
    .catch(() => undefined);
  if (!registration) return;

  const subscription = await registration.pushManager
    ?.getSubscription()
    .catch(() => undefined);
  const notifications = await registration
    .getNotifications()
    .catch(() => []);
  notifications.forEach((notification) => notification.close());
  await subscription?.unsubscribe().catch(() => false);
}
