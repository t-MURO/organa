import * as SecureStore from "expo-secure-store";

import type {
  AccountDeletionCache,
  CachedDeletionRequest,
} from "./account-deletion-cache.types";

const prefix = "organa.account-deletion.";

export const accountDeletionCache: AccountDeletionCache = {
  async get(userId) {
    const value = await SecureStore.getItemAsync(`${prefix}${userId}`);
    return parseRequest(value);
  },
  async remove(userId) {
    await SecureStore.deleteItemAsync(`${prefix}${userId}`);
  },
  async set(userId, request) {
    await SecureStore.setItemAsync(
      `${prefix}${userId}`,
      JSON.stringify(request),
    );
  },
};

function parseRequest(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CachedDeletionRequest>;
    return validRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
