import type { AppLockAdapter } from "./app-lock-adapter.types";

export interface AppLockState {
  enabled: boolean;
  error: string;
  locked: boolean;
  supported: boolean;
}

export async function loadAppLockState(
  adapter: Pick<AppLockAdapter, "getEnabled" | "isSupported">,
): Promise<AppLockState> {
  try {
    const [supported, enabled] = await Promise.all([
      adapter.isSupported(),
      adapter.getEnabled(),
    ]);
    return {
      enabled,
      error:
        enabled && !supported
          ? "Device authentication is unavailable. Organa will stay locked until it is available again."
          : "",
      locked: enabled,
      supported,
    };
  } catch {
    return {
      enabled: true,
      error:
        "App lock status could not be checked. Organa stayed locked to protect your private space.",
      locked: true,
      supported: false,
    };
  }
}

export function shouldLockForAppState(
  enabled: boolean,
  appState: string,
) {
  return enabled && appState !== "active";
}
