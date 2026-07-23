import type { ExportFileWriter } from "./export-file.types";

export function createExportFileWriter(): ExportFileWriter {
  return {
    async save() {
      throw new Error("File export is not available on this platform.");
    },
  };
}
