import type {
  AccountDeletionCache,
  CachedDeletionRequest,
} from "./account-deletion-cache.types";

const requests = new Map<string, CachedDeletionRequest>();

export const accountDeletionCache: AccountDeletionCache = {
  async get(userId) {
    return requests.get(userId) ?? null;
  },
  async remove(userId) {
    requests.delete(userId);
  },
  async set(userId, request) {
    requests.set(userId, request);
  },
};
