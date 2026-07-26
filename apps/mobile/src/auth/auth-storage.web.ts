import type { AuthStorage } from "./auth-storage.types";
import {
  getProtectedBrowserValue,
  removeProtectedBrowserValue,
} from "../security/protected-browser-storage";

const memoryFallback = new Map<string, string>();

export const authStorage: AuthStorage = {
  async getItem(key) {
    const durableValue = readBrowserValue(key);
    if (durableValue !== null) {
      memoryFallback.set(key, durableValue);
      return durableValue;
    }

    // Preserve sessions created before auth storage moved out of the vault.
    const protectedValue = await getProtectedBrowserValue(key);
    if (protectedValue !== null) {
      memoryFallback.set(key, protectedValue);
      await removeProtectedBrowserValue(key).catch(() => undefined);
      writeBrowserValue(key, protectedValue);
      return protectedValue;
    }
    return memoryFallback.get(key) ?? null;
  },
  async setItem(key, value) {
    memoryFallback.set(key, value);
    writeBrowserValue(key, value);
  },
  async removeItem(key) {
    memoryFallback.delete(key);
    removeBrowserValue(key);
    await removeProtectedBrowserValue(key);
  },
};

function browserStorage() {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function readBrowserValue(key: string) {
  try {
    return browserStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeBrowserValue(key: string, value: string) {
  try {
    browserStorage()?.setItem(key, value);
  } catch {
    // The in-memory copy keeps the current tab usable in restricted browsers.
  }
}

function removeBrowserValue(key: string) {
  try {
    browserStorage()?.removeItem(key);
  } catch {
    // There is no durable value to remove when browser storage is unavailable.
  }
}
