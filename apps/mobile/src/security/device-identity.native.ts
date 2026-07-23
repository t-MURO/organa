import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

import type { DeviceIdentity } from "./device-identity";

const key = "organa.device-identity";

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return JSON.parse(existing) as DeviceIdentity;

  const identity = { createdAt: new Date().toISOString(), id: randomUUID() };
  await SecureStore.setItemAsync(key, JSON.stringify(identity));
  return identity;
}
