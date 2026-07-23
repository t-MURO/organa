export interface BackupFileReader {
  pick(): Promise<string | null>;
}
