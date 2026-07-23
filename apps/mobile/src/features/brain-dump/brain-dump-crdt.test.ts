import { createBrainDumpBullet } from "@organa/domain";
import { describe, expect, it } from "vitest";

import {
  applyCrdtUpdate,
  editCrdtBullet,
  initializeCrdtBullet,
} from "./brain-dump-crdt";

describe("Brain Dump CRDT", () => {
  it("retains simultaneous edits from two devices", () => {
    const base = initializeCrdtBullet(
      createBrainDumpBullet("Remember", "bullet-1", 1),
    );
    const left = editCrdtBullet(base, "Remember alpha", "update-left");
    const right = editCrdtBullet(base, "Remember beta", "update-right");

    const merged = applyCrdtUpdate(
      applyCrdtUpdate(base, left.update),
      right.update,
    );
    expect(merged.text).toContain("alpha");
    expect(merged.text).toContain("beta");
  });

  it("applies updates in either order", () => {
    const base = initializeCrdtBullet(
      createBrainDumpBullet("List", "bullet-1", 1),
    );
    const left = editCrdtBullet(base, "List A", "update-left");
    const right = editCrdtBullet(base, "List B", "update-right");
    const leftFirst = applyCrdtUpdate(
      applyCrdtUpdate(base, left.update),
      right.update,
    );
    const rightFirst = applyCrdtUpdate(
      applyCrdtUpdate(base, right.update),
      left.update,
    );

    expect(leftFirst.text).toBe(rightFirst.text);
  });
});
