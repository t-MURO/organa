import type {
  EncryptedMutation,
  SyncOutboxRepository,
} from "./sync-outbox.types";

const stores = new Map<string, Map<string, EncryptedMutation>>();

export function createSyncOutboxRepository(
  namespace = "local",
): SyncOutboxRepository {
  const store =
    stores.get(namespace) ?? new Map<string, EncryptedMutation>();
  stores.set(namespace, store);
  return {
    async initialize() {},
    async list() {
      return [...store.values()].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    },
    async upsert(mutation) {
      store.set(mutation.id, mutation);
    },
    async remove(id) {
      store.delete(id);
    },
  };
}
