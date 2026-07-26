import type { AuthStorage } from "./auth-storage.types";
import {
  getDeviceBoundItem,
  removeDeviceBoundItem,
  setDeviceBoundItem,
} from "../security/device-bound-secure-store";

const chunkSize = 1800;

export const authStorage: AuthStorage = {
  async getItem(key) {
    const countValue = await getDeviceBoundItem(metaKey(key));
    if (!countValue) return getDeviceBoundItem(key);

    const count = Number(countValue);
    if (!Number.isInteger(count) || count <= 0) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        getDeviceBoundItem(chunkKey(key, index)),
      ),
    );
    return chunks.every((chunk): chunk is string => chunk !== null)
      ? chunks.join("")
      : null;
  },
  async setItem(key, value) {
    await removeChunkedValue(key);
    if (value.length <= chunkSize) {
      await setDeviceBoundItem(key, value);
      return;
    }

    const chunks = Array.from(
      { length: Math.ceil(value.length / chunkSize) },
      (_, index) => value.slice(index * chunkSize, (index + 1) * chunkSize),
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        setDeviceBoundItem(chunkKey(key, index), chunk),
      ),
    );
    await setDeviceBoundItem(metaKey(key), String(chunks.length));
  },
  async removeItem(key) {
    await removeChunkedValue(key);
  },
};

async function removeChunkedValue(key: string) {
  const countValue = await getDeviceBoundItem(metaKey(key));
  const count = Number(countValue ?? 0);
  if (Number.isInteger(count) && count > 0) {
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        removeDeviceBoundItem(chunkKey(key, index)),
      ),
    );
  }
  await Promise.all([
    removeDeviceBoundItem(metaKey(key)),
    removeDeviceBoundItem(key),
  ]);
}

function metaKey(key: string) {
  return `${key}.chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}.chunk.${index}`;
}
