export interface ContentKey {
  id: string;
  encoded: string;
}

export interface EncryptedEnvelope {
  version: 1;
  algorithm: "AES-256-GCM";
  keyId: string;
  aad: string;
  combined: string;
}

export interface RecoveryKeyEnvelope {
  version: 1;
  algorithm: "AES-256-GCM";
  keyId: string;
  combined: string;
}

export interface KeyHierarchy {
  contentKey: ContentKey;
  recoveryCode: string;
  recoveryEnvelope: RecoveryKeyEnvelope;
}
