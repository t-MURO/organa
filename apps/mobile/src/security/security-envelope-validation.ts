import type {
  DeviceApprovalEnvelope,
  DeviceApprovalExchangeEnvelope,
  RecoveryKeyEnvelope,
} from "@organa/crypto";

export function parseRecoveryKeyEnvelope(
  value: unknown,
  expectedKeyId: string,
): RecoveryKeyEnvelope {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.algorithm !== "AES-256-GCM" ||
    value.keyId !== expectedKeyId ||
    typeof value.combined !== "string" ||
    value.combined.length === 0
  ) {
    throw new Error("The stored recovery information is invalid.");
  }
  return {
    algorithm: value.algorithm,
    combined: value.combined,
    keyId: value.keyId,
    version: value.version,
  };
}

export function parseDeviceApprovalEnvelope(
  value: unknown,
  expectedDeviceId: string,
): DeviceApprovalEnvelope {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.algorithm !== "AES-256-GCM" ||
    typeof value.keyId !== "string" ||
    value.keyId.length === 0 ||
    value.targetDeviceId !== expectedDeviceId ||
    typeof value.combined !== "string" ||
    value.combined.length === 0
  ) {
    throw new Error("The trusted-device approval is invalid.");
  }
  return {
    algorithm: value.algorithm,
    combined: value.combined,
    keyId: value.keyId,
    targetDeviceId: value.targetDeviceId,
    version: value.version,
  };
}

export function parseDeviceApprovalExchangeEnvelope(
  value: unknown,
  expectedDeviceId: string,
  expectedRecipientPublicKey: string,
): DeviceApprovalExchangeEnvelope {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    value.algorithm !== "X25519-HKDF-SHA256-AES-256-GCM" ||
    typeof value.keyId !== "string" ||
    value.keyId.length === 0 ||
    value.targetDeviceId !== expectedDeviceId ||
    value.recipientPublicKey !== expectedRecipientPublicKey ||
    !isHexKey(value.recipientPublicKey) ||
    !isHexKey(value.senderPublicKey) ||
    typeof value.combined !== "string" ||
    value.combined.length === 0
  ) {
    throw new Error("The trusted-device approval is invalid.");
  }
  return {
    algorithm: value.algorithm,
    combined: value.combined,
    keyId: value.keyId,
    recipientPublicKey: value.recipientPublicKey,
    senderPublicKey: value.senderPublicKey,
    targetDeviceId: value.targetDeviceId,
    version: value.version,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHexKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
