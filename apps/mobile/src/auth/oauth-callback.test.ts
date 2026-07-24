import { describe, expect, it } from "vitest";

import {
  createOAuthCallbackCoordinator,
  parseOAuthCallback,
} from "./oauth-callback";

describe("native OAuth callback handling", () => {
  it("accepts only the configured redirect location", () => {
    expect(
      parseOAuthCallback(
        "organa:///?code=valid-code",
        "organa:///",
      ),
    ).toEqual({ code: "valid-code", type: "code" });
    expect(
      parseOAuthCallback(
        "organa:///other?code=wrong-path",
        "organa:///",
      ),
    ).toEqual({ type: "ignore" });
    expect(
      parseOAuthCallback(
        "https://attacker.example/?code=wrong-origin",
        "organa:///",
      ),
    ).toEqual({ type: "ignore" });
    expect(
      parseOAuthCallback("not a url", "organa:///"),
    ).toEqual({ type: "ignore" });
  });

  it("handles provider errors without exposing remote error text", () => {
    expect(
      parseOAuthCallback(
        "organa:///#error=access_denied&error_description=provider-secret",
        "organa:///",
      ),
    ).toEqual({
      message: "Sign-in was cancelled.",
      type: "error",
    });
    expect(
      parseOAuthCallback(
        "organa:///?error_code=unexpected&error_description=provider-secret",
        "organa:///",
      ),
    ).toEqual({
      message: "Sign-in could not be completed. Please try again.",
      type: "error",
    });
  });

  it("deduplicates simultaneous and repeated one-time codes", async () => {
    let releaseExchange: (() => void) | undefined;
    const exchanged: string[] = [];
    const coordinator = createOAuthCallbackCoordinator(
      "organa:///",
      async (code) => {
        exchanged.push(code);
        await new Promise<void>((resolve) => {
          releaseExchange = resolve;
        });
      },
    );

    const first = coordinator.handle("organa:///?code=one-time");
    const duplicate = coordinator.handle("organa:///?code=one-time");
    expect(exchanged).toEqual(["one-time"]);

    releaseExchange?.();
    await Promise.all([first, duplicate]);
    await coordinator.handle("organa:///?code=one-time");

    expect(exchanged).toEqual(["one-time"]);
  });

  it("allows a failed exchange to be retried", async () => {
    let attempts = 0;
    const coordinator = createOAuthCallbackCoordinator(
      "organa:///",
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
      },
    );

    await expect(
      coordinator.handle("organa:///?code=retry"),
    ).rejects.toThrow("temporary failure");
    await expect(
      coordinator.handle("organa:///?code=retry"),
    ).resolves.toBe(true);
    expect(attempts).toBe(2);
  });
});
