import type { AuthStorage } from "./auth-storage.types";

function storage() {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

export const authStorage: AuthStorage = {
  async getItem(key) {
    return storage()?.getItem(key) ?? null;
  },
  async setItem(key, value) {
    storage()?.setItem(key, value);
  },
  async removeItem(key) {
    storage()?.removeItem(key);
  },
};
