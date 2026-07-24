import {
  createDeviceIdentity,
  type DeviceIdentity,
} from "./device-identity.shared";
import {
  getProtectedBrowserValue,
  removeProtectedBrowserValue,
  setProtectedBrowserValue,
} from "./protected-browser-storage";

const key = "organa.device-identity";

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await getProtectedBrowserValue(key);
  if (existing) {
    const parsed = parseIdentity(existing);
    if (parsed?.id && parsed.createdAt && parsed.secret) {
      return parsed as DeviceIdentity;
    }
    if (parsed?.id && parsed.createdAt) {
      const migrated = {
        ...createDeviceIdentity(),
        createdAt: parsed.createdAt,
        id: parsed.id,
      };
      await setProtectedBrowserValue(key, JSON.stringify(migrated));
      return migrated;
    }
  }

  const identity = createDeviceIdentity();
  await setProtectedBrowserValue(key, JSON.stringify(identity));
  return identity;
}

export async function removeDeviceIdentity() {
  await removeProtectedBrowserValue(key);
}

function parseIdentity(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<DeviceIdentity>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.createdAt !== "string" ||
      (parsed.secret !== undefined && typeof parsed.secret !== "string")
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
