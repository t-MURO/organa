import * as SecureStore from "expo-secure-store";

import type { ReminderAuthorizationCache } from "./reminder-authorization-cache.types";

const prefix = "organa.reminder-authorization.";

export const reminderAuthorizationCache: ReminderAuthorizationCache = {
  async get(userId) {
    const value = await SecureStore.getItemAsync(`${prefix}${userId}`);
    if (value === "allowed") return true;
    if (value === "disabled") return false;
    return null;
  },
  async remove(userId) {
    await SecureStore.deleteItemAsync(`${prefix}${userId}`);
  },
  async set(userId, allowed) {
    await SecureStore.setItemAsync(
      `${prefix}${userId}`,
      allowed ? "allowed" : "disabled",
    );
  },
};
