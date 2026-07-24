import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("reminder authorization integration contract", () => {
  it("does not reconcile task or Check-In notifications before authorization loads", () => {
    const tasks = source("../tasks/task-context.tsx");
    const settings = source("../settings/settings-context.tsx");

    expect(tasks).toContain("if (!authorizationReady) return");
    expect(tasks).toContain("devices.reminderAuthorizationReady");
    expect(tasks).toContain(
      "const authorization = reminderAuthorizationRef.current",
    );
    expect(settings).toContain("if (!devices.reminderAuthorizationReady) return");
  });

  it("applies device authorization to web nudges and private cleanup", () => {
    const coordinator = source(
      "../notifications/notification-coordinator.web.tsx",
    );
    const lifecycle = source("./account-lifecycle-context.tsx");
    const devices = source("./device-context.tsx");

    expect(coordinator).toContain(
      "!devices.reminderAuthorizationReady || !devices.remindersAllowed",
    );
    expect(lifecycle).toContain("reminderAuthorizationCache.remove(userId)");
    expect(devices).toContain("reminderAuthorizationCache.remove(userId)");
  });
});
