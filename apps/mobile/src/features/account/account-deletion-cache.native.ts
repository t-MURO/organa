import type {
  AccountDeletionCache,
  CachedDeletionRequest,
} from "./account-deletion-cache.types";
import {
  getDeviceBoundItem,
  removeDeviceBoundItem,
  setDeviceBoundItem,
} from "../../security/device-bound-secure-store";

const prefix = "organa.account-deletion.";

export const accountDeletionCache: AccountDeletionCache = {
  async get(userId) {
    const value = await getDeviceBoundItem(`${prefix}${userId}`);
    return parseRequest(value);
  },
  async remove(userId) {
    await removeDeviceBoundItem(`${prefix}${userId}`);
  },
  async set(userId, request) {
    await setDeviceBoundItem(
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
