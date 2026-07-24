import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("OAuth configuration contract", () => {
  it("pins the native redirect, PKCE storage, and callback entry points", () => {
    const appConfig = JSON.parse(source("../../app.json")) as {
      expo?: { scheme?: string };
    };
    const localSupabaseConfig = source("../../../../supabase/config.toml");
    const client = source("./supabase.ts");
    const authContext = source("./auth-context.tsx");

    expect(appConfig.expo?.scheme).toBe("organa");
    expect(localSupabaseConfig).toContain('"organa://**"');
    expect(client).toContain('flowType: "pkce"');
    expect(client).toContain("storage: authStorage");
    expect(authContext).toContain("Linking.getInitialURL()");
    expect(authContext).toContain('Linking.addEventListener("url"');
    expect(authContext).toContain("coordinator.handle(url)");
    expect(authContext).toContain(
      "oauthCallbackCoordinator.handle(result.url)",
    );
  });
});
