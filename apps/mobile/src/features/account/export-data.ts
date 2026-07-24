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
import { isValidBrainDumpCrdtState } from "../brain-dump/brain-dump-crdt";

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

const MAX_BACKUP_CHARACTERS = 20 * 1024 * 1024;

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
  if (contents.length > MAX_BACKUP_CHARACTERS) {
    throw new Error("The selected backup is larger than 20 MB.");
  }

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
    !isTimestamp(value.encryptedAt) ||
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
    isTimestamp(value.exportedAt) &&
    isArrayOf(value.tasks, isTask) &&
    isArrayOf(value.templates, isTaskTemplate) &&
    isUserSettings(value.settings) &&
    isArrayOf(value.checkIns, isCheckInEntry) &&
    isArrayOf(value.brainDump, isBrainDumpBullet)
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isTaskInput(value) &&
    isTaskKind(value.kind) &&
    isTaskPriority(value.priority) &&
    isArrayOf(value.reminders, isReminder) &&
    isArrayOf(value.subtasks, isSubtask) &&
    isSnoozePresets(value.snoozePresets) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isOptional(value.completedAt, isTimestamp) &&
    isOptional(value.doseConfirmedAt, isTimestamp)
  );
}

function isTaskInput(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !isNonEmptyString(value.title)) return false;

  const kind = value.kind ?? "one_off";
  const validShape =
    isOptional(value.details, isString) &&
    isOptional(value.kind, isTaskKind) &&
    isOptional(value.priority, isTaskPriority) &&
    isOptional(value.plannedFor, isLocalDate) &&
    isOptional(value.scheduledTime, isLocalTime) &&
    isOptional(value.dueDate, isLocalDate) &&
    isOptional(value.dueAt, isTimestamp) &&
    isOptional(value.estimatedMinutes, isPositiveInteger) &&
    isOptional(value.recurrence, isRecurrence) &&
    isOptional(value.reminders, (item) => isArrayOf(item, isReminder)) &&
    isOptional(value.subtasks, (item) => isArrayOf(item, isSubtask)) &&
    isOptional(value.snoozePresets, isSnoozePresets) &&
    isOptional(value.graceDays, isGraceDays) &&
    isOptional(value.requireDoseConfirmation, isBoolean) &&
    isOptional(value.subtaskRemindersEnabled, isBoolean) &&
    isOptional(value.seriesId, isNonEmptyString) &&
    isOptional(value.previousOccurrenceId, isNonEmptyString) &&
    isOptional(value.occurrenceNumber, isPositiveInteger);

  return (
    validShape &&
    (value.graceDays === undefined ||
      (kind !== "one_off" && value.recurrence !== undefined)) &&
    (value.requireDoseConfirmation === undefined || kind === "medication")
  );
}

function isReminder(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    (value.stage === "before_due" ||
      value.stage === "at_due" ||
      value.stage === "after_due") &&
    isNonNegativeInteger(value.offsetMinutes) &&
    typeof value.enabled === "boolean"
  );
}

function isSubtask(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isOptional(value.completedAt, isTimestamp) &&
    isOptional(value.reminders, (item) => isArrayOf(item, isReminder))
  );
}

function isRecurrence(value: unknown) {
  return (
    isRecord(value) &&
    (value.frequency === "daily" ||
      value.frequency === "weekly" ||
      value.frequency === "monthly") &&
    isPositiveInteger(value.interval) &&
    isOptional(
      value.anchorDay,
      (anchorDay) =>
        Number.isInteger(anchorDay) &&
        Number(anchorDay) >= 1 &&
        Number(anchorDay) <= 31,
    ) &&
    isOptional(value.weekdays, (item) =>
      isArrayOf(
        item,
        (weekday) =>
          Number.isInteger(weekday) &&
          Number(weekday) >= 0 &&
          Number(weekday) <= 6,
      ),
    )
  );
}

function isTaskTemplate(value: unknown): value is TaskTemplate {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isOptional(value.description, isString) &&
    value.source === "user" &&
    isTaskInput(value.task) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isUserSettings(value: unknown): value is UserSettings {
  return (
    isRecord(value) &&
    value.id === "user-settings" &&
    (value.theme === "system" ||
      value.theme === "light" ||
      value.theme === "dark") &&
    typeof value.appSoundsEnabled === "boolean" &&
    typeof value.hapticsEnabled === "boolean" &&
    isRecord(value.checkInReminder) &&
    typeof value.checkInReminder.enabled === "boolean" &&
    isLocalTime(value.checkInReminder.time) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isCheckInEntry(value: unknown): value is CheckInEntry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isLocalDate(value.date) &&
    Number.isInteger(value.mood) &&
    Number(value.mood) >= 1 &&
    Number(value.mood) <= 5 &&
    isOptional(value.feeling, isOneWordString) &&
    isOptional(value.reflection, isString) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isBrainDumpBullet(value: unknown): value is BrainDumpBullet {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.text === "string" &&
    typeof value.rank === "number" &&
    Number.isFinite(value.rank) &&
    isOptional(value.crdtState, (item) =>
      typeof item === "string" && isValidBrainDumpCrdtState(item),
    ) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
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

function isArrayOf(
  value: unknown,
  predicate: (item: unknown) => boolean,
): value is unknown[] {
  return Array.isArray(value) && value.every(predicate);
}

function isOptional(
  value: unknown,
  predicate: (item: unknown) => boolean,
) {
  return value === undefined || predicate(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isGraceDays(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function isSnoozePresets(value: unknown) {
  if (!Array.isArray(value) || !value.every(isPositiveInteger)) return false;
  return value.every(
    (minutes, index) => index === 0 || minutes > value[index - 1],
  );
}

function isOneWordString(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !/\s/.test(value)
  );
}

function isTaskKind(value: unknown) {
  return value === "one_off" || value === "habit" || value === "medication";
}

function isTaskPriority(value: unknown) {
  return value === "must" || value === "should" || value === "nice";
}

function isLocalDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isLocalTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isTimestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
