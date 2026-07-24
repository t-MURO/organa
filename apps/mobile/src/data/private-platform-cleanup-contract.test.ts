import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("private platform cleanup contract", () => {
  it("clears private notification and widget surfaces on every sign-out path", () => {
    const auth = source("../auth/auth-context.tsx");

    expect(auth).toContain(
      'import { clearPrivatePlatformState } from "../data/clear-private-platform-state"',
    );
    expect(auth).toContain('event === "SIGNED_OUT"');
    expect(auth).toContain("await clearPrivatePlatformState()");
  });

  it("clears native notification content before deleting account data", () => {
    const deletion = source("./delete-local-account-data.native.ts");
    const nativeCleanup = source("./clear-private-platform-state.native.ts");

    expect(deletion).toContain("await clearPrivatePlatformState()");
    expect(nativeCleanup).toContain(
      "Notifications.cancelAllScheduledNotificationsAsync()",
    );
    expect(nativeCleanup).toContain(
      "Notifications.dismissAllNotificationsAsync()",
    );
  });

  it("replaces iOS widget timelines with content-free states", () => {
    const iosCleanup = source("./clear-private-platform-state.ios.ts");

    expect(iosCleanup).toContain("TodayTasksWidget.updateTimeline");
    expect(iosCleanup).toContain("NextReminderWidget.updateTimeline");
    expect(iosCleanup).toContain("remaining: 0");
    expect(iosCleanup).toContain('title: "No upcoming reminder"');
    expect(iosCleanup).toContain("await Promise.allSettled([");
  });
});
