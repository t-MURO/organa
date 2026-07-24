import { describe, expect, it, vi } from "vitest";

import { deliverCompletionHaptic } from "./completion-haptic";

function driver() {
  return {
    androidConfirm: vi.fn(async () => undefined),
    iosSuccess: vi.fn(async () => undefined),
  };
}

describe("completion haptics", () => {
  it("uses each native platform effect and keeps web quiet", async () => {
    const iosDriver = driver();
    const androidDriver = driver();
    const webDriver = driver();

    await expect(
      deliverCompletionHaptic("ios", true, iosDriver),
    ).resolves.toBe(true);
    await expect(
      deliverCompletionHaptic("android", true, androidDriver),
    ).resolves.toBe(true);
    await expect(
      deliverCompletionHaptic("web", true, webDriver),
    ).resolves.toBe(false);

    expect(iosDriver.iosSuccess).toHaveBeenCalledOnce();
    expect(iosDriver.androidConfirm).not.toHaveBeenCalled();
    expect(androidDriver.androidConfirm).toHaveBeenCalledOnce();
    expect(androidDriver.iosSuccess).not.toHaveBeenCalled();
    expect(webDriver.androidConfirm).not.toHaveBeenCalled();
    expect(webDriver.iosSuccess).not.toHaveBeenCalled();
  });

  it("does nothing when completion haptics are disabled", async () => {
    const disabledDriver = driver();

    await expect(
      deliverCompletionHaptic("ios", false, disabledDriver),
    ).resolves.toBe(false);
    expect(disabledDriver.androidConfirm).not.toHaveBeenCalled();
    expect(disabledDriver.iosSuccess).not.toHaveBeenCalled();
  });

  it("absorbs platform failures so completion still succeeds", async () => {
    const failingDriver = driver();
    failingDriver.androidConfirm.mockRejectedValue(
      new Error("Haptics unavailable"),
    );

    await expect(
      deliverCompletionHaptic("android", true, failingDriver),
    ).resolves.toBe(false);
  });
});
