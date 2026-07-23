import type { AppLockAdapter } from "./app-lock-adapter.types";

export function createAppLockAdapter(): AppLockAdapter {
  return {
    async authenticate() {
      return false;
    },
    async getEnabled() {
      return false;
    },
    async isSupported() {
      return false;
    },
    async setEnabled() {},
  };
}
