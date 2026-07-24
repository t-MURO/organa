import type {
  DeviceApprovalEnvelope,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
