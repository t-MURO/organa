import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
  TaskTemplate,
  UserSettings,
} from "@organa/domain";
import type {
  EncryptedEnvelope,
  RecoveryKeyEnvelope,
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
