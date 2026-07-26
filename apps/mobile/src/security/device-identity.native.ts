import {
  createDeviceIdentity,
  parseStoredDeviceIdentity,
  type DeviceIdentity,
} from "./device-identity.shared";
import {
  getDeviceBoundItem,
  removeDeviceBoundItem,
  setDeviceBoundItem,
} from "./device-bound-secure-store";

const key = "organa.device-identity";

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await getDeviceBoundItem(key);
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
      await setDeviceBoundItem(key, JSON.stringify(migrated));
      return migrated;
    }
  }

  const identity = createDeviceIdentity();
  await setDeviceBoundItem(key, JSON.stringify(identity));
  return identity;
}

export async function removeDeviceIdentity() {
  await removeDeviceBoundItem(key);
}
