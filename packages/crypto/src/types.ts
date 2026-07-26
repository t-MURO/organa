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

export interface DeviceApprovalEnvelope {
  version: 1;
  algorithm: "AES-256-GCM";
  keyId: string;
  targetDeviceId: string;
  combined: string;
}

export interface DeviceApprovalExchangeEnvelope {
  version: 2;
  algorithm: "X25519-HKDF-SHA256-AES-256-GCM";
  keyId: string;
  targetDeviceId: string;
  recipientPublicKey: string;
  senderPublicKey: string;
  combined: string;
}

export interface DeviceApprovalExchangeKeyPair {
  version: 1;
  algorithm: "X25519";
  publicKey: string;
  secretKey: string;
}

export interface KeyHierarchy {
  contentKey: ContentKey;
  recoveryCode: string;
  recoveryEnvelope: RecoveryKeyEnvelope;
}
