import type { ReminderAuthorizationCache } from "./reminder-authorization-cache.types";
import {
  getDeviceBoundItem,
  removeDeviceBoundItem,
  setDeviceBoundItem,
} from "../../security/device-bound-secure-store";

const prefix = "organa.reminder-authorization.";

export const reminderAuthorizationCache: ReminderAuthorizationCache = {
  async get(userId) {
    const value = await getDeviceBoundItem(`${prefix}${userId}`);
    if (value === "allowed") return true;
    if (value === "disabled") return false;
    return null;
  },
  async remove(userId) {
    await removeDeviceBoundItem(`${prefix}${userId}`);
  },
  async set(userId, allowed) {
    await setDeviceBoundItem(
      `${prefix}${userId}`,
      allowed ? "allowed" : "disabled",
    );
  },
};
