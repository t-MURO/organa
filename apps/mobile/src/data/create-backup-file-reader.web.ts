import * as DocumentPicker from "expo-document-picker";

import type { BackupFileReader } from "./backup-file-reader.types";

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function createBackupFileReader(): BackupFileReader {
  return {
    async pick() {
      const result = await DocumentPicker.getDocumentAsync({
        base64: false,
        multiple: false,
        type: "application/json",
      });
      if (result.canceled) return null;

      const asset = result.assets[0];
      if (!asset?.file) {
        throw new Error("The browser could not read the selected backup.");
      }
      if (asset.file.size > MAX_BACKUP_BYTES) {
        throw new Error("The selected backup is larger than 20 MB.");
      }
      return asset.file.text();
    },
  };
}
