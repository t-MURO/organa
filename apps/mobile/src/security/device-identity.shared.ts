import { randomUUID } from "expo-crypto";

export interface DeviceIdentity {
  id: string;
  createdAt: string;
  secret: string;
}

export function createDeviceIdentity(): DeviceIdentity {
  return {
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    secret: `${randomUUID()}${randomUUID()}`,
  };
}
