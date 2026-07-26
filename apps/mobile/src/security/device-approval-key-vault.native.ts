import type { DeviceApprovalKeyVault } from "./device-approval-key-vault.types";
import { parseDeviceApprovalKeyPair } from "./device-approval-key-vault.validation";
import {
  getDeviceBoundItem,
  removeDeviceBoundItem,
  setDeviceBoundItem,
} from "./device-bound-secure-store";

export const deviceApprovalKeyVault: DeviceApprovalKeyVault = {
  async get(userId, deviceId) {
    const value = await getDeviceBoundItem(storageKey(userId, deviceId));
    return value ? parseDeviceApprovalKeyPair(value) : null;
  },
  async set(userId, deviceId, keyPair) {
    await setDeviceBoundItem(
      storageKey(userId, deviceId),
      JSON.stringify(keyPair),
    );
  },
  async remove(userId, deviceId) {
    await removeDeviceBoundItem(storageKey(userId, deviceId));
  },
};

function storageKey(userId: string, deviceId: string) {
  return `organa.device-approval-key.${userId}.${deviceId}`;
}
