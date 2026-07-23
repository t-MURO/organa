import type { AuthStorage } from "./auth-storage.types";

const memory = new Map<string, string>();

export const authStorage: AuthStorage = {
  async getItem(key) {
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    memory.set(key, value);
  },
  async removeItem(key) {
    memory.delete(key);
  },
};
