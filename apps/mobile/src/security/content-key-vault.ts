import type { ContentKey } from "@organa/crypto";

import type { ContentKeyVault } from "./content-key-vault.types";

const keys = new Map<string, ContentKey>();

export const contentKeyVault: ContentKeyVault = {
  async get(userId) {
    return keys.get(userId) ?? null;
  },
  async set(userId, key) {
    keys.set(userId, key);
  },
  async remove(userId) {
    keys.delete(userId);
  },
};
