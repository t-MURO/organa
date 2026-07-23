import type {
  AccountDeletionCache,
  CachedDeletionRequest,
} from "./account-deletion-cache.types";

const prefix = "organa.account-deletion.";

export const accountDeletionCache: AccountDeletionCache = {
  async get(userId) {
    const localStorage = storage();
    if (!localStorage) return null;

    const key = `${prefix}${userId}`;
    const value = localStorage.getItem(key);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<CachedDeletionRequest>;
      if (validRequest(parsed)) return parsed;
    } catch {
      // Invalid cache data is removed below.
    }
    localStorage.removeItem(key);
    return null;
  },
  async remove(userId) {
    storage()?.removeItem(`${prefix}${userId}`);
  },
  async set(userId, request) {
    storage()?.setItem(`${prefix}${userId}`, JSON.stringify(request));
  },
};

function storage() {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function" ||
    typeof localStorage.setItem !== "function" ||
    typeof localStorage.removeItem !== "function"
  ) {
    return undefined;
  }
  return localStorage;
}

function validRequest(
  value: Partial<CachedDeletionRequest>,
): value is CachedDeletionRequest {
  return (
    typeof value.executeAfter === "string" &&
    Number.isFinite(new Date(value.executeAfter).getTime()) &&
    typeof value.requestedAt === "string" &&
    Number.isFinite(new Date(value.requestedAt).getTime())
  );
}
