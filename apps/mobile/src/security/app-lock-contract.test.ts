import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("app lock integration contract", () => {
  it("keeps startup loading separate from foreground locking", () => {
    const context = source("./app-lock-context.tsx");
    const boundary = source("./app-lock-boundary.tsx");
    const nativeAdapter = source("./create-app-lock-adapter.native.ts");
    const layout = source("../app/_layout.tsx");

    expect(context).toMatch(
      /loadAppLockState\(adapter\)[\s\S]+?\}, \[\]\);/,
    );
    expect(context).toMatch(
      /AppState\.addEventListener\("change"[\s\S]+?\}, \[enabled\]\);/,
    );
    expect(nativeAdapter).toContain(
      'if (value === null || value === "false") return false;',
    );
    expect(nativeAdapter).toContain('if (value === "true") return true;');
    expect(nativeAdapter).toContain(
      'throw new Error("The app lock preference is invalid.");',
    );
    expect(boundary).toMatch(
      /try \{[\s\S]+?await appLock\.unlock\(\);[\s\S]+?finally \{/,
    );
    expect(boundary.indexOf("if (appLock.loading)")).toBeLessThan(
      boundary.indexOf("if (!appLock.locked) return children;"),
    );
    expect(layout.indexOf("<AppLockBoundary>")).toBeLessThan(
      layout.indexOf("<SecurityProvider>"),
    );
    expect(layout.indexOf("</AppLockBoundary>")).toBeGreaterThan(
      layout.indexOf("<AppShell />"),
    );
  });
});
