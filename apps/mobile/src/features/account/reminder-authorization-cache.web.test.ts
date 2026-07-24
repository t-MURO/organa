import { afterEach, describe, expect, it } from "vitest";

import { reminderAuthorizationCache } from "./reminder-authorization-cache.web";

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

describe("web reminder authorization cache", () => {
  it("stays inert during server rendering", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {},
    });

    await expect(reminderAuthorizationCache.get("user-1")).resolves.toBeNull();
    await expect(
      reminderAuthorizationCache.set("user-1", true),
    ).resolves.toBeUndefined();
  });

  it("round-trips and removes the last trusted authorization", async () => {
    const values = installStorage();

    await reminderAuthorizationCache.set("user-1", true);
    await expect(reminderAuthorizationCache.get("user-1")).resolves.toBe(true);
    await reminderAuthorizationCache.set("user-1", false);
    await expect(reminderAuthorizationCache.get("user-1")).resolves.toBe(false);
    await reminderAuthorizationCache.remove("user-1");
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
