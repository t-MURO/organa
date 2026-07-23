import {
  createDeviceIdentity,
  type DeviceIdentity,
} from "./device-identity.shared";

export type { DeviceIdentity } from "./device-identity.shared";

let identity: DeviceIdentity | undefined;

export async function getDeviceIdentity() {
  identity ??= createDeviceIdentity();
  return identity;
}
