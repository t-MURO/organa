import { describe, expect, it } from "vitest";

import { resolveReminderAuthorization } from "./reminder-authorization";

describe("reminder authorization", () => {
  it("waits without disabling reminders while local and remote state load", () => {
    expect(
      resolveReminderAuthorization({
        cacheLoaded: false,
        cachedAllowed: null,
        localPreview: false,
        remoteResolved: false,
      }),
    ).toEqual({ allowed: false, ready: false });
    expect(
      resolveReminderAuthorization({
        cacheLoaded: true,
        cachedAllowed: null,
        localPreview: false,
        remoteResolved: false,
      }),
    ).toEqual({ allowed: false, ready: false });
  });

  it("retains the last authorized state during an offline launch", () => {
    expect(
      resolveReminderAuthorization({
        cacheLoaded: true,
        cachedAllowed: true,
        localPreview: false,
        remoteResolved: false,
      }),
    ).toEqual({ allowed: true, ready: true });
    expect(
      resolveReminderAuthorization({
        cacheLoaded: true,
        cachedAllowed: false,
        localPreview: false,
        remoteResolved: false,
      }),
    ).toEqual({ allowed: false, ready: true });
  });

  it("lets fresh server state override the cache", () => {
    expect(
      resolveReminderAuthorization({
        cacheLoaded: true,
        cachedAllowed: true,
        currentDevice: {
          notificationsEnabled: false,
          primaryReminder: false,
          revokedAt: null,
        },
        localPreview: false,
        remoteResolved: true,
      }),
    ).toEqual({ allowed: false, ready: true });
    expect(
      resolveReminderAuthorization({
        cacheLoaded: true,
        cachedAllowed: true,
        localPreview: false,
        remoteResolved: true,
      }),
    ).toEqual({ allowed: false, ready: true });
  });
});
