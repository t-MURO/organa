import { afterEach, describe, expect, it } from "vitest";

import { authStorage } from "./auth-storage.web";

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

describe("web auth storage", () => {
  it("stays inert when server rendering exposes a storage placeholder", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {},
    });

    await expect(authStorage.getItem("session")).resolves.toBeNull();
    await expect(
      authStorage.setItem("session", "secret"),
    ).resolves.toBeUndefined();
    await expect(authStorage.removeItem("session")).resolves.toBeUndefined();
  });

  it("uses a complete browser Storage implementation", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    await authStorage.setItem("session", "secret");
    await expect(authStorage.getItem("session")).resolves.toBe("secret");
    await authStorage.removeItem("session");
    await expect(authStorage.getItem("session")).resolves.toBeNull();
  });
});
