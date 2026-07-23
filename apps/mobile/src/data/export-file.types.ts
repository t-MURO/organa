export interface ExportFile {
  contents: string;
  filename: string;
  mimeType: string;
}

export interface ExportFileWriter {
  save(file: ExportFile): Promise<void>;
}
