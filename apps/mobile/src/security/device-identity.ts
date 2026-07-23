import { randomUUID } from "expo-crypto";

export interface DeviceIdentity {
  id: string;
  createdAt: string;
}

let identity: DeviceIdentity | undefined;

export async function getDeviceIdentity() {
  identity ??= { createdAt: new Date().toISOString(), id: randomUUID() };
  return identity;
}
