import { describe, expect, it } from "vitest";

import { createUserSettings, updateUserSettings } from "./settings";

describe("user settings", () => {
  it("uses pressure-free defaults", () => {
    const settings = createUserSettings();
    expect(settings.theme).toBe("system");
    expect(settings.appSoundsEnabled).toBe(false);
    expect(settings.hapticsEnabled).toBe(true);
    expect(settings.checkInReminder).toEqual({
      enabled: false,
      time: "20:00",
    });
  });

  it("validates the Check-In reminder time", () => {
    const settings = createUserSettings();
    expect(() =>
      updateUserSettings(settings, {
        checkInReminder: { enabled: true, time: "25:00" },
      }),
    ).toThrow("HH:MM");
  });
});
