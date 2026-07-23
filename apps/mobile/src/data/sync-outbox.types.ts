import type { EncryptedEnvelope } from "@organa/crypto";

export type SyncRecordType =
  | "task"
  | "brain_dump_bullet"
  | "brain_dump_update"
  | "check_in"
  | "template"
  | "settings";

export type EncryptedFieldPatch = Record<string, EncryptedEnvelope>;

export interface EncryptedMutation {
  id: string;
  userId: string;
  deviceId: string;
  recordType: SyncRecordType;
  recordId: string;
  operation: "upsert" | "delete";
  ciphertext?: EncryptedFieldPatch;
  fieldVersions: Record<string, string>;
  baseVersion: number;
  createdAt: string;
  attempts: number;
}

export interface SyncOutboxRepository {
  initialize(): Promise<void>;
  list(): Promise<EncryptedMutation[]>;
  upsert(mutation: EncryptedMutation): Promise<void>;
  remove(id: string): Promise<void>;
}
