import type { BackupFileReader } from "./backup-file-reader.types";

export function createBackupFileReader(): BackupFileReader {
  return {
    async pick() {
      throw new Error("Backup import is unavailable on this platform.");
    },
  };
}
