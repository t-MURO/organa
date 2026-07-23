import { createKeyHierarchy, encryptJson } from "@organa/crypto";
import { createUserSettings } from "@organa/domain";
import { describe, expect, it } from "vitest";

import {
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

async function createBackup(): Promise<{
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
        data,
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
});
