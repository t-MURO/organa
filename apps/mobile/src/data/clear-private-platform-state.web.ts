import {
  clearPendingWebPushSchedules,
  removeCurrentWebPushSubscription,
} from "./web-push-scheduler.web";

export async function clearPrivatePlatformState() {
  await removeCurrentWebPushSubscription().catch(() => undefined);
  clearPendingWebPushSchedules();
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
