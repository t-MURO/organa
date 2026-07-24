import { describe, expect, it, vi } from "vitest";

import {
  loadAppLockState,
  shouldLockForAppState,
} from "./app-lock-state";

function adapter({
  enabled,
  supported,
}: {
  enabled: boolean;
  supported: boolean;
}) {
  return {
    getEnabled: vi.fn(async () => enabled),
    isSupported: vi.fn(async () => supported),
  };
}

describe("app lock startup state", () => {
  it("opens only when the stored preference is disabled", async () => {
    await expect(
      loadAppLockState(adapter({ enabled: false, supported: true })),
    ).resolves.toEqual({
      enabled: false,
      error: "",
      locked: false,
      supported: true,
    });
  });

  it("keeps an enabled lock closed even if device authentication disappears", async () => {
    const state = await loadAppLockState(
      adapter({ enabled: true, supported: false }),
    );

    expect(state.enabled).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.supported).toBe(false);
    expect(state.error).toContain("stay locked");
  });

  it("fails closed when secure preference or support loading fails", async () => {
    const failingAdapter = adapter({ enabled: false, supported: true });
    failingAdapter.getEnabled.mockRejectedValue(
      new Error("SecureStore unavailable"),
    );

    const state = await loadAppLockState(failingAdapter);

    expect(state.enabled).toBe(true);
    expect(state.locked).toBe(true);
    expect(state.supported).toBe(false);
    expect(state.error).toContain("protect your private space");
  });

  it("locks enabled apps whenever they leave the active state", () => {
    expect(shouldLockForAppState(true, "inactive")).toBe(true);
    expect(shouldLockForAppState(true, "background")).toBe(true);
    expect(shouldLockForAppState(true, "active")).toBe(false);
    expect(shouldLockForAppState(false, "background")).toBe(false);
  });
});
