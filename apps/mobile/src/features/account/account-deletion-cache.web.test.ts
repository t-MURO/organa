import { afterEach, describe, expect, it } from "vitest";

import { accountDeletionCache } from "./account-deletion-cache.web";

const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

describe("web account deletion cache", () => {
  it("stays inert during server rendering", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {},
    });

    await expect(accountDeletionCache.get("user-1")).resolves.toBeNull();
    await expect(
      accountDeletionCache.set("user-1", request()),
    ).resolves.toBeUndefined();
  });

  it("round-trips the active deletion window", async () => {
    const values = installStorage();

    await accountDeletionCache.set("user-1", request());
    await expect(accountDeletionCache.get("user-1")).resolves.toEqual(
      request(),
    );
    await accountDeletionCache.remove("user-1");
    expect(values.size).toBe(0);
  });

  it("removes malformed cached state", async () => {
    const values = installStorage();
    values.set("organa.account-deletion.user-1", '{"executeAfter":"later"}');

    await expect(accountDeletionCache.get("user-1")).resolves.toBeNull();
    expect(values.size).toBe(0);
  });
});

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

function request() {
  return {
    executeAfter: "2026-07-23T21:00:00.000Z",
    requestedAt: "2026-07-23T20:00:00.000Z",
  };
}
