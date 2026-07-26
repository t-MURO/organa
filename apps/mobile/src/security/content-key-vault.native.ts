import type { ContentKeyVault } from "./content-key-vault.types";
import { parseContentKeyVaultValue } from "./content-key-vault.validation";
import {
  getDeviceBoundItem,
  removeDeviceBoundItem,
  setDeviceBoundItem,
} from "./device-bound-secure-store";

export const contentKeyVault: ContentKeyVault = {
  async get(userId) {
    const value = await getDeviceBoundItem(storageKey(userId));
    return value ? parseContentKeyVaultValue(value) : null;
  },
  async set(userId, value) {
    await setDeviceBoundItem(storageKey(userId), JSON.stringify(value));
  },
  async remove(userId) {
    await removeDeviceBoundItem(storageKey(userId));
  },
};

function storageKey(userId: string) {
  return `organa.content-key.${userId}`;
}
