import {
  createDeviceIdentity,
  parseStoredDeviceIdentity,
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
    const parsed = parseStoredDeviceIdentity(existing);
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
