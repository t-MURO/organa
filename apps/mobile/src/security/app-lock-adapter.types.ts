export interface AppLockAdapter {
  authenticate(): Promise<boolean>;
  getEnabled(): Promise<boolean>;
  isSupported(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}
