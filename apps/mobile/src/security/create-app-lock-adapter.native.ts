import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import type { AppLockAdapter } from "./app-lock-adapter.types";

const enabledKey = "organa:app-lock-enabled";

export function createAppLockAdapter(): AppLockAdapter {
  return {
    async authenticate() {
      const result = await LocalAuthentication.authenticateAsync({
        biometricsSecurityLevel: "strong",
        cancelLabel: "Not now",
        disableDeviceFallback: false,
        fallbackLabel: "Use device passcode",
        promptMessage: "Unlock Organa",
      });
      return result.success;
    },
    async getEnabled() {
      const value = await SecureStore.getItemAsync(enabledKey);
      if (value === null || value === "false") return false;
      if (value === "true") return true;
      throw new Error("The app lock preference is invalid.");
    },
    async isSupported() {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      return level !== LocalAuthentication.SecurityLevel.NONE;
    },
    async setEnabled(enabled) {
      await SecureStore.setItemAsync(enabledKey, String(enabled));
    },
  };
}
