import {
  createDeviceIdentity,
  type DeviceIdentity,
} from "./device-identity.shared";

const key = "organa.device-identity";

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing =
    typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  if (existing) {
    const parsed = JSON.parse(existing) as Partial<DeviceIdentity>;
    if (parsed.id && parsed.createdAt && parsed.secret) {
      return parsed as DeviceIdentity;
    }
    if (parsed.id && parsed.createdAt) {
      const migrated = { ...createDeviceIdentity(), ...parsed };
      localStorage.setItem(key, JSON.stringify(migrated));
      return migrated;
    }
  }

  const identity = createDeviceIdentity();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, JSON.stringify(identity));
  }
  return identity;
}
