import { describe, expect, it } from "vitest";

import {
  createBrainDumpBullet,
  rankAfterBullet,
  searchBrainDumpBullets,
  sortBrainDumpBullets,
  updateBrainDumpBullet,
} from "./brain-dump";

const morning = new Date("2026-07-23T08:00:00.000Z");
const evening = new Date("2026-07-23T18:00:00.000Z");

describe("Brain Dump", () => {
  it("creates a bullet without allowing embedded line breaks", () => {
    const bullet = createBrainDumpBullet(
      "Call the dentist\nAsk about Friday",
      "bullet-1",
      1_024,
      morning,
    );

    expect(bullet).toMatchObject({
      id: "bullet-1",
      text: "Call the dentist Ask about Friday",
      rank: 1_024,
      createdAt: morning.toISOString(),
    });
  });

  it("updates bullet text and its timestamp", () => {
    const bullet = createBrainDumpBullet(
      "Water basil",
      "bullet-1",
      1_024,
      morning,
    );
    const updated = updateBrainDumpBullet(bullet, "Water the basil", evening);

    expect(updated.text).toBe("Water the basil");
    expect(updated.updatedAt).toBe(evening.toISOString());
    expect(updated.createdAt).toBe(morning.toISOString());
  });

  it("creates a stable rank between neighboring bullets", () => {
    const first = createBrainDumpBullet("First", "first", 1_024, morning);
    const second = createBrainDumpBullet("Second", "second", 2_048, morning);

    expect(rankAfterBullet([second, first], "first")).toBe(1_536);
    expect(rankAfterBullet([second, first], "second")).toBe(3_072);
  });

  it("sorts and searches bullets case-insensitively", () => {
    const first = createBrainDumpBullet("Buy oat milk", "first", 1_024, morning);
    const second = createBrainDumpBullet(
      "Book dentist appointment",
      "second",
      2_048,
      evening,
    );

    expect(sortBrainDumpBullets([second, first]).map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
    expect(searchBrainDumpBullets([second, first], "DENTIST")).toEqual([second]);
  });
});
