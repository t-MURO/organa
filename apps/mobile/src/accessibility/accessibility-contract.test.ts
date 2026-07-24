import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const pressableModule = fileURLToPath(
  new URL("./accessible-pressable.tsx", import.meta.url),
);
const sourceFiles = collectSourceFiles(sourceRoot);

describe("application accessibility contract", () => {
  it("routes every application pressable through the shared native hit area", () => {
    const interactiveFiles = sourceFiles.filter(({ content }) =>
      content.includes("<Pressable"),
    );

    expect(interactiveFiles.length).toBeGreaterThan(0);
    for (const { content, path } of interactiveFiles) {
      expect(content, path).toContain("AccessiblePressable as Pressable");
    }

    for (const { content, path } of sourceFiles) {
      if (path === pressableModule) continue;
      expect(content, path).not.toMatch(
        /import\s*\{[^}]*\bPressable\b[^}]*\}\s*from\s*"react-native"/s,
      );
    }

    const wrapper = readFileSync(pressableModule, "utf8");
    expect(wrapper).toContain("bottom: 14");
    expect(wrapper).toContain("left: 14");
    expect(wrapper).toContain("right: 14");
    expect(wrapper).toContain("top: 14");
    expect(wrapper).toContain("hitSlop={hitSlop}");
  });

  it("keeps web targets WCAG-sized and expands coarse-pointer hit areas", () => {
    const html = readFileSync(
      fileURLToPath(new URL("../app/+html.tsx", import.meta.url)),
      "utf8",
    );

    expect(html).toContain("min-block-size: 24px !important");
    expect(html).toContain("min-inline-size: 24px !important");
    expect(html).toContain("@media (pointer: coarse)");
    expect(html).toContain("height: max(100%, 44px)");
    expect(html).toContain("width: max(100%, 44px)");
  });

  it("keeps system text scaling enabled throughout application UI", () => {
    for (const { content, path } of sourceFiles) {
      expect(content, path).not.toContain("allowFontScaling={false}");
      expect(content, path).not.toContain("adjustsFontSizeToFit");
      expect(content, path).not.toContain("maxFontSizeMultiplier");
      expect(content, path).not.toContain("numberOfLines=");
    }
  });
});

function collectSourceFiles(directory: string): {
  content: string;
  path: string;
}[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return collectSourceFiles(path);
    }
    if (!/\.(ts|tsx)$/.test(entry) || entry.includes(".test.")) return [];
    return [{ content: readFileSync(path, "utf8"), path }];
  });
}
