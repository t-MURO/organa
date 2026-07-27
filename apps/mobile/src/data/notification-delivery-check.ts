import type { NotificationDeliveryCheckResult } from "./notification-delivery-check.types";

export async function sendNotificationDeliveryCheck(): Promise<NotificationDeliveryCheckResult> {
  return {
    message: "System notifications are unavailable in this environment.",
    status: "unsupported",
  };
}
