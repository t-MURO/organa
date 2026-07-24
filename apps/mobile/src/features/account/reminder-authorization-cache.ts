import type { ReminderAuthorizationCache } from "./reminder-authorization-cache.types";

const values = new Map<string, boolean>();

export const reminderAuthorizationCache: ReminderAuthorizationCache = {
  async get(userId) {
    return values.get(userId) ?? null;
  },
  async remove(userId) {
    values.delete(userId);
  },
  async set(userId, allowed) {
    values.set(userId, allowed);
  },
};
