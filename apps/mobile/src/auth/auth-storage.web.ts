import type { AuthStorage } from "./auth-storage.types";

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
