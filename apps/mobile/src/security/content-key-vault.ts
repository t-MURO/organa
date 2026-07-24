import type {
  ContentKeyVault,
  ContentKeyVaultValue,
} from "./content-key-vault.types";

const keys = new Map<string, ContentKeyVaultValue>();

export const contentKeyVault: ContentKeyVault = {
  async get(userId) {
    return keys.get(userId) ?? null;
  },
  async set(userId, value) {
    keys.set(userId, value);
  },
  async remove(userId) {
    keys.delete(userId);
  },
};
