export {
  createContentKey,
  decryptJson,
  deriveOpaqueRecordId,
  encryptJson,
  importContentKey,
} from "./record-encryption";
export {
  createDeviceApproval,
  createDeviceApprovalExchange,
  createDeviceApprovalExchangeKeyPair,
  unwrapDeviceApproval,
  unwrapDeviceApprovalExchange,
} from "./device-approval";
export {
  createKeyHierarchy,
  createRecoveryEnrollmentProof,
  normalizeRecoveryCode,
  unwrapContentKey,
} from "./recovery-key";

export type {
  ContentKey,
  DeviceApprovalEnvelope,
  DeviceApprovalExchangeEnvelope,
  DeviceApprovalExchangeKeyPair,
  EncryptedEnvelope,
  KeyHierarchy,
  RecoveryKeyEnvelope,
} from "./types";
