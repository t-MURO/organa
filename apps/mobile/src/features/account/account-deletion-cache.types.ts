export interface CachedDeletionRequest {
  executeAfter: string;
  requestedAt: string;
}

export interface AccountDeletionCache {
  get(userId: string): Promise<CachedDeletionRequest | null>;
  remove(userId: string): Promise<void>;
  set(userId: string, request: CachedDeletionRequest): Promise<void>;
}
