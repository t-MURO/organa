import type { DeviceApprovalKeyVault } from "./device-approval-key-vault.types";
import { parseDeviceApprovalKeyPair } from "./device-approval-key-vault.validation";
import {
  getProtectedBrowserValue,
  removeProtectedBrowserValue,
  setProtectedBrowserValue,
} from "./protected-browser-storage";

export const deviceApprovalKeyVault: DeviceApprovalKeyVault = {
  async get(userId, deviceId) {
    const value = await getProtectedBrowserValue(
      storageKey(userId, deviceId),
    );
    return value ? parseDeviceApprovalKeyPair(value) : null;
  },
  async set(userId, deviceId, keyPair) {
    await setProtectedBrowserValue(
      storageKey(userId, deviceId),
      JSON.stringify(keyPair),
    );
  },
  async remove(userId, deviceId) {
    await removeProtectedBrowserValue(storageKey(userId, deviceId));
  },
};

function storageKey(userId: string, deviceId: string) {
  return `organa.device-approval-key.${userId}.${deviceId}`;
}
