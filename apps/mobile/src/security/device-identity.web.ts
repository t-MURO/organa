import { randomUUID } from "expo-crypto";

import type { DeviceIdentity } from "./device-identity";

const key = "organa.device-identity";

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing =
    typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  if (existing) return JSON.parse(existing) as DeviceIdentity;

  const identity = { createdAt: new Date().toISOString(), id: randomUUID() };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, JSON.stringify(identity));
  }
  return identity;
}
