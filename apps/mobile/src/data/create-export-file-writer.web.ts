import type { ExportFileWriter } from "./export-file.types";

export function createExportFileWriter(): ExportFileWriter {
  return {
    async save({ contents, filename, mimeType }) {
      const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = url;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
  };
}
