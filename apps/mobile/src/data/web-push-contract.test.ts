import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("Web Push integration contract", () => {
  it("requests permission only through an explicit scheduling request", () => {
    const scheduler = source("./web-push-scheduler.web.ts");

    expect(scheduler).toContain(
      'webPushConfigured = /^B[A-Za-z0-9_-]{86}$/.test',
    );
    expect(scheduler).toContain(
      'if (permission === "default" && requestPermission)',
    );
    expect(scheduler).toContain("Notification.requestPermission()");
    expect(scheduler.indexOf("await ensureSubscription(true)")).toBeLessThan(
      scheduler.indexOf("const context = await currentContext()"),
    );
    expect(scheduler.indexOf("Notification.requestPermission()")).toBeLessThan(
      scheduler.indexOf("navigator.serviceWorker.ready"),
    );
    expect(scheduler).toContain('window.addEventListener("online"');
  });

  it("proof-gates schedule replacement and unsubscribes on sign-out", () => {
    const scheduler = source("./web-push-scheduler.web.ts");
    const cleanup = source("./clear-private-platform-state.web.ts");
    const authContext = source("../auth/auth-context.tsx");

    expect(scheduler).toContain(
      'supabase.rpc("replace_web_push_schedule"',
    );
    expect(scheduler).toContain(
      'supabase.rpc("remove_current_web_push_subscription"',
    );
    expect(scheduler).toContain("p_current_device_proof");
    expect(cleanup).toContain("removeCurrentWebPushSubscription()");
    expect(cleanup).toContain("subscription?.unsubscribe()");
    expect(cleanup).toContain("notification.close()");
    expect(authContext.indexOf("await clearPrivatePlatformState()")).toBeLessThan(
      authContext.indexOf('supabase.auth.signOut({ scope: "local" })'),
    );
  });

  it("does not acknowledge a newer schedule after an in-flight sync", () => {
    const scheduler = source("./web-push-scheduler.web.ts");

    expect(scheduler).toContain(
      "const latestSchedules = readSchedules(context.storageKey)",
    );
    expect(scheduler).toContain(
      "scheduleEntriesEqual(latestSchedules[scope], entries)",
    );
  });

  it("uses protocol encryption and sends no private reminder copy", () => {
    const dispatcher = source(
      "../../../../supabase/functions/dispatch-web-push/index.ts",
    );

    expect(dispatcher).toContain("webpush.sendNotification");
    expect(dispatcher).toContain("p256dh: reminder.p256dh");
    expect(dispatcher).toContain("auth: reminder.auth_secret");
    expect(dispatcher).not.toContain("taskTitle");
    expect(dispatcher).not.toContain("medication");
    expect(dispatcher).not.toContain("mood");
  });
});
