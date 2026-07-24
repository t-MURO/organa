import { randomUUID } from "expo-crypto";

export interface DeviceIdentity {
  id: string;
  createdAt: string;
  secret: string;
}

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const deviceIdPattern = new RegExp(`^${uuidPattern}$`, "i");
const deviceSecretPattern = new RegExp(
  `^${uuidPattern}${uuidPattern}$`,
  "i",
);

export function createDeviceIdentity(): DeviceIdentity {
  return {
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    secret: `${randomUUID()}${randomUUID()}`,
  };
}

export function parseStoredDeviceIdentity(
  value: string,
): Partial<DeviceIdentity> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("id" in parsed) ||
      typeof parsed.id !== "string" ||
      !deviceIdPattern.test(parsed.id) ||
      !("createdAt" in parsed) ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      ("secret" in parsed &&
        parsed.secret !== undefined &&
        (typeof parsed.secret !== "string" ||
          !deviceSecretPattern.test(parsed.secret)))
    ) {
      return undefined;
    }
    return parsed as Partial<DeviceIdentity>;
  } catch {
    return undefined;
  }
}
