import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import type { BackupFileReader } from "./backup-file-reader.types";

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function createBackupFileReader(): BackupFileReader {
  return {
    async pick() {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "application/json",
      });
      if (result.canceled) return null;

      const asset = result.assets[0];
      if (!asset) return null;
      if (asset.size && asset.size > MAX_BACKUP_BYTES) {
        throw new Error("The selected backup is larger than 20 MB.");
      }

      const file = new File(asset.uri);
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error("The selected backup is larger than 20 MB.");
      }
      return file.text();
    },
  };
}
