export interface NotificationDeliveryCheckResult {
  message: string;
  status: "sent" | "denied" | "channel_disabled" | "unsupported";
}
