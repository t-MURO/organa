import type { DeviceApprovalExchangeKeyPair } from "@organa/crypto";

import type { DeviceApprovalKeyVault } from "./device-approval-key-vault.types";

const keys = new Map<string, DeviceApprovalExchangeKeyPair>();

export const deviceApprovalKeyVault: DeviceApprovalKeyVault = {
  async get(userId, deviceId) {
    return keys.get(storageKey(userId, deviceId)) ?? null;
  },
  async set(userId, deviceId, keyPair) {
    keys.set(storageKey(userId, deviceId), keyPair);
  },
  async remove(userId, deviceId) {
    keys.delete(storageKey(userId, deviceId));
  },
};

function storageKey(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}
