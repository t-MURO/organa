import type { NotificationDeliveryCheckResult } from "./notification-delivery-check.types";

export async function sendNotificationDeliveryCheck(): Promise<NotificationDeliveryCheckResult> {
  if (typeof Notification === "undefined") {
    return {
      message: "This browser does not support system notifications.",
      status: "unsupported",
    };
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") {
    return {
      message:
        "This browser is blocking Organa notifications. Enable them in the browser site settings, then try again.",
      status: "denied",
    };
  }

  new Notification("Organa test reminder", {
    body: "If you can see this, Organa can reach this browser.",
    silent: true,
  });
  return {
    message: "Test sent. It should appear immediately.",
    status: "sent",
  };
}
