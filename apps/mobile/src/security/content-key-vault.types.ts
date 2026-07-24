import type { ContentKey, RecoveryKeyEnvelope } from "@organa/crypto";

export interface ContentKeyVaultValue {
  contentKey: ContentKey;
  recoveryEnvelope: RecoveryKeyEnvelope | null;
}

export interface ContentKeyVault {
  get(userId: string): Promise<ContentKeyVaultValue | null>;
  set(userId: string, value: ContentKeyVaultValue): Promise<void>;
  remove(userId: string): Promise<void>;
}
