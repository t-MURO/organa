import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
  TaskTemplate,
  UserSettings,
} from "@organa/domain";
import {
  decryptJson,
  type EncryptedEnvelope,
  type RecoveryKeyEnvelope,
  unwrapContentKey,
} from "@organa/crypto";

export interface OrganaExportData {
  exportedAt: string;
  format: "organa-readable-v1";
  tasks: Task[];
  templates: TaskTemplate[];
  settings: UserSettings;
  checkIns: CheckInEntry[];
  brainDump: BrainDumpBullet[];
}

export interface OrganaEncryptedBackup {
  backupId: string;
  encryptedAt: string;
  format: "organa-encrypted-backup-v1";
  recoveryKeyEnvelope: RecoveryKeyEnvelope;
  payload: EncryptedEnvelope;
}

export function createReadableJson(data: OrganaExportData) {
  const { checkIns: _checkIns, brainDump: _brainDump, ...structured } = data;
  return JSON.stringify(structured, null, 2);
}

export function createReflectionMarkdown(data: OrganaExportData) {
  const checkIns =
    data.checkIns.length === 0
      ? "_No Check-In entries yet._"
      : data.checkIns
          .map((entry) => {
            const details = [
              `Mood: ${entry.mood}/5`,
              entry.feeling ? `Feeling: ${entry.feeling}` : undefined,
              entry.reflection?.trim() || undefined,
            ].filter(Boolean);
            return `## ${entry.date}\n\n${details.join("\n\n")}`;
          })
          .join("\n\n");

  const brainDump =
    data.brainDump.length === 0
      ? "_No Brain Dump bullets yet._"
      : data.brainDump.map((bullet) => `- ${bullet.text}`).join("\n");

  return [
    "# Organa reflections",
    "",
    `Exported ${data.exportedAt}`,
    "",
    "# Check-In",
    "",
    checkIns,
    "",
    "# Brain Dump",
    "",
    brainDump,
    "",
  ].join("\n");
}

export async function restoreEncryptedBackup(
  contents: string,
  recoveryCode: string,
): Promise<OrganaExportData> {
  const backup = parseEncryptedBackup(contents);
  const contentKey = await unwrapContentKey(
    recoveryCode,
    backup.recoveryKeyEnvelope,
  );
  const data = await decryptJson<unknown>(
    backup.payload,
    contentKey,
    "backup",
    backup.backupId,
  );

  if (!isOrganaExportData(data)) {
    throw new Error("The decrypted backup does not contain valid Organa data.");
  }
  return data;
}

export function parseEncryptedBackup(contents: string): OrganaEncryptedBackup {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (
    !isRecord(value) ||
    value.format !== "organa-encrypted-backup-v1" ||
    typeof value.backupId !== "string" ||
    !value.backupId ||
    typeof value.encryptedAt !== "string" ||
    !isRecoveryEnvelope(value.recoveryKeyEnvelope) ||
    !isEncryptedEnvelope(value.payload) ||
    value.payload.keyId !== value.recoveryKeyEnvelope.keyId
  ) {
    throw new Error("The selected file is not a valid Organa encrypted backup.");
  }

  return value as unknown as OrganaEncryptedBackup;
}

function isOrganaExportData(value: unknown): value is OrganaExportData {
  return (
    isRecord(value) &&
    value.format === "organa-readable-v1" &&
    typeof value.exportedAt === "string" &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.templates) &&
    isRecord(value.settings) &&
    Array.isArray(value.checkIns) &&
    Array.isArray(value.brainDump)
  );
}

function isRecoveryEnvelope(value: unknown): value is RecoveryKeyEnvelope {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.algorithm === "AES-256-GCM" &&
    typeof value.keyId === "string" &&
    typeof value.combined === "string"
  );
}

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.algorithm === "AES-256-GCM" &&
    typeof value.keyId === "string" &&
    typeof value.combined === "string" &&
    typeof value.aad === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
