export interface CompletionHapticDriver {
  androidConfirm(): Promise<void>;
  iosSuccess(): Promise<void>;
}

export async function deliverCompletionHaptic(
  platform: string,
  enabled: boolean,
  driver: CompletionHapticDriver,
) {
  if (!enabled) return false;

  try {
    if (platform === "android") {
      await driver.androidConfirm();
      return true;
    }
    if (platform === "ios") {
      await driver.iosSuccess();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
