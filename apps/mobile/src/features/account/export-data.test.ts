import { createKeyHierarchy, encryptJson } from "@organa/crypto";
import { createTask, createUserSettings } from "@organa/domain";
import { describe, expect, it } from "vitest";

import {
  parseEncryptedBackup,
  restoreEncryptedBackup,
  type OrganaEncryptedBackup,
  type OrganaExportData,
} from "./export-data";

const data: OrganaExportData = {
  brainDump: [],
  checkIns: [],
  exportedAt: "2026-07-23T12:00:00.000Z",
  format: "organa-readable-v1",
  settings: createUserSettings(),
  tasks: [],
  templates: [],
};

async function createBackup(payload: unknown = data): Promise<{
  backup: OrganaEncryptedBackup;
  recoveryCode: string;
}> {
  const hierarchy = await createKeyHierarchy();
  const backupId = "full-test";
  return {
    backup: {
      backupId,
      encryptedAt: data.exportedAt,
      format: "organa-encrypted-backup-v1",
      payload: await encryptJson(
        payload,
        hierarchy.contentKey,
        "backup",
        backupId,
      ),
      recoveryKeyEnvelope: hierarchy.recoveryEnvelope,
    },
    recoveryCode: hierarchy.recoveryCode,
  };
}

describe("encrypted backup restoration", () => {
  it("restores a full backup using its recovery code", async () => {
    const { backup, recoveryCode } = await createBackup();

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).resolves.toEqual(data);
  });

  it("preserves a valid date-only task deadline", async () => {
    const dateOnlyData = {
      ...data,
      tasks: [
        createTask(
          {
            dueDate: "2026-08-15",
            title: "Submit paperwork",
          },
          "date-only",
          new Date(data.exportedAt),
        ),
      ],
    };
    const { backup, recoveryCode } = await createBackup(dateOnlyData);

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).resolves.toEqual(dateOnlyData);
  });

  it("rejects impossible calendar dates in restored tasks", async () => {
    const invalidData = {
      ...data,
      tasks: [
        {
          ...createTask(
            { title: "Invalid deadline" },
            "invalid-date",
            new Date(data.exportedAt),
          ),
          dueDate: "2026-02-30",
        },
      ],
    };
    const { backup, recoveryCode } = await createBackup(invalidData);

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).rejects.toThrow("does not contain valid Organa data");
  });

  it("rejects backup metadata that no longer matches the ciphertext", async () => {
    const { backup, recoveryCode } = await createBackup();
    const changed = { ...backup, backupId: "changed-id" };

    await expect(
      restoreEncryptedBackup(JSON.stringify(changed), recoveryCode),
    ).rejects.toThrow("metadata is invalid");
  });

  it("rejects a recovery code from another account", async () => {
    const { backup } = await createBackup();
    const other = await createKeyHierarchy();

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), other.recoveryCode),
    ).rejects.toThrow();
  });

  it("rejects malformed records before they reach local storage", async () => {
    const invalidData = {
      ...data,
      tasks: [{ id: "not-a-task" }],
    };
    const { backup, recoveryCode } = await createBackup(invalidData);

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).rejects.toThrow("does not contain valid Organa data");
  });

  it.each([
    {
      label: "zero-minute snooze presets",
      value: {
        ...createTask(
          { title: "Invalid snooze" },
          "invalid-snooze",
          new Date(data.exportedAt),
        ),
        snoozePresets: [0, 10],
      },
    },
    {
      label: "duplicate snooze presets",
      value: {
        ...createTask(
          { title: "Duplicate snooze" },
          "duplicate-snooze",
          new Date(data.exportedAt),
        ),
        snoozePresets: [10, 10],
      },
    },
    {
      label: "out-of-order snooze presets",
      value: {
        ...createTask(
          { title: "Out-of-order snooze" },
          "unordered-snooze",
          new Date(data.exportedAt),
        ),
        snoozePresets: [30, 10],
      },
    },
    {
      label: "more than three grace days",
      value: {
        ...createTask(
          {
            graceDays: 3,
            kind: "habit",
            plannedFor: "2026-07-23",
            recurrence: { frequency: "daily" as const, interval: 1 },
            title: "Invalid grace",
          },
          "invalid-grace",
          new Date(data.exportedAt),
        ),
        graceDays: 4,
      },
    },
    {
      label: "grace days on a one-off task",
      value: {
        ...createTask(
          { title: "Invalid one-off grace" },
          "invalid-one-off-grace",
          new Date(data.exportedAt),
        ),
        graceDays: 1,
      },
    },
    {
      label: "grace days on a non-recurring habit",
      value: {
        ...createTask(
          { kind: "habit", title: "Invalid non-recurring grace" },
          "invalid-non-recurring-grace",
          new Date(data.exportedAt),
        ),
        graceDays: 1,
      },
    },
    {
      label: "dose confirmation on a non-medication task",
      value: {
        ...createTask(
          { title: "Invalid dose confirmation" },
          "invalid-dose",
          new Date(data.exportedAt),
        ),
        requireDoseConfirmation: true,
      },
    },
    {
      label: "recurrence on a one-off task",
      value: {
        ...createTask(
          { title: "Invalid one-off recurrence" },
          "invalid-one-off-recurrence",
          new Date(data.exportedAt),
        ),
        recurrence: { frequency: "daily" as const, interval: 1 },
      },
    },
  ])("rejects restored tasks with $label", async ({ value }) => {
    const { backup, recoveryCode } = await createBackup({
      ...data,
      tasks: [value],
    });

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).rejects.toThrow("does not contain valid Organa data");
  });

  it.each([
    { feeling: "a bit tired", label: "multi-word" },
    { feeling: " tired", label: "padded" },
    { feeling: "", label: "empty" },
  ])("rejects restored $label feeling labels", async ({ feeling }) => {
    const { backup, recoveryCode } = await createBackup({
      ...data,
      checkIns: [
        {
          createdAt: data.exportedAt,
          date: "2026-07-23",
          feeling,
          id: "check-in-2026-07-23",
          mood: 3,
          updatedAt: data.exportedAt,
        },
      ],
    });

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).rejects.toThrow("does not contain valid Organa data");
  });

  it("rejects corrupt Brain Dump CRDT state before restoration", async () => {
    const invalidData = {
      ...data,
      brainDump: [
        {
          createdAt: data.exportedAt,
          crdtState: "not-valid-yjs-data",
          id: "thought-1",
          rank: 1_024,
          text: "A thought",
          updatedAt: data.exportedAt,
        },
      ],
    };
    const { backup, recoveryCode } = await createBackup(invalidData);

    await expect(
      restoreEncryptedBackup(JSON.stringify(backup), recoveryCode),
    ).rejects.toThrow("does not contain valid Organa data");
  });

  it("rejects oversized backup input before parsing JSON", () => {
    expect(() => parseEncryptedBackup(" ".repeat(20 * 1024 * 1024 + 1))).toThrow(
      "larger than 20 MB",
    );
  });
});
