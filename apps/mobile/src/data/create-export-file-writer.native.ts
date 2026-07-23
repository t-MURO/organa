import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { ExportFileWriter } from "./export-file.types";

export function createExportFileWriter(): ExportFileWriter {
  return {
    async save({ contents, filename, mimeType }) {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("The system share sheet is unavailable.");
      }

      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      file.write(contents);
      await Sharing.shareAsync(file.uri, {
        dialogTitle: `Export ${filename}`,
        mimeType,
        UTI: mimeType === "application/json" ? "public.json" : "public.text",
      });
    },
  };
}
