import * as SecureStore from "expo-secure-store";

import {
  createDeviceIdentity,
  type DeviceIdentity,
} from "./device-identity.shared";

const key = "organa.device-identity";

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await SecureStore.getItemAsync(key);
  if (existing) {
    const parsed = JSON.parse(existing) as Partial<DeviceIdentity>;
    if (parsed.id && parsed.createdAt && parsed.secret) {
      return parsed as DeviceIdentity;
    }
    if (parsed.id && parsed.createdAt) {
      const migrated = {
        ...createDeviceIdentity(),
        createdAt: parsed.createdAt,
        id: parsed.id,
      };
      await SecureStore.setItemAsync(key, JSON.stringify(migrated));
      return migrated;
    }
  }

  const identity = createDeviceIdentity();
  await SecureStore.setItemAsync(key, JSON.stringify(identity));
  return identity;
}

export async function removeDeviceIdentity() {
  await SecureStore.deleteItemAsync(key);
}
