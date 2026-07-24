import type { ReminderAuthorizationCache } from "./reminder-authorization-cache.types";

const prefix = "organa.reminder-authorization.";

export const reminderAuthorizationCache: ReminderAuthorizationCache = {
  async get(userId) {
    const value = storage()?.getItem(`${prefix}${userId}`);
    if (value === "allowed") return true;
    if (value === "disabled") return false;
    return null;
  },
  async remove(userId) {
    storage()?.removeItem(`${prefix}${userId}`);
  },
  async set(userId, allowed) {
    storage()?.setItem(
      `${prefix}${userId}`,
      allowed ? "allowed" : "disabled",
    );
  },
};

function storage() {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function" ||
    typeof localStorage.setItem !== "function" ||
    typeof localStorage.removeItem !== "function"
  ) {
    return undefined;
  }
  return localStorage;
}
