import type { DeviceApprovalExchangeKeyPair } from "@organa/crypto";

export interface DeviceApprovalKeyVault {
  get(
    userId: string,
    deviceId: string,
  ): Promise<DeviceApprovalExchangeKeyPair | null>;
  set(
    userId: string,
    deviceId: string,
    keyPair: DeviceApprovalExchangeKeyPair,
  ): Promise<void>;
  remove(userId: string, deviceId: string): Promise<void>;
}
