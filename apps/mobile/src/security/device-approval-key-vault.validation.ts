import type { DeviceApprovalExchangeKeyPair } from "@organa/crypto";

export function parseDeviceApprovalKeyPair(
  value: string,
): DeviceApprovalExchangeKeyPair | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      parsed.algorithm !== "X25519" ||
      !isHexKey(parsed.publicKey) ||
      !isHexKey(parsed.secretKey)
    ) {
      return null;
    }
    return {
      algorithm: parsed.algorithm,
      publicKey: parsed.publicKey,
      secretKey: parsed.secretKey,
      version: parsed.version,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHexKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
