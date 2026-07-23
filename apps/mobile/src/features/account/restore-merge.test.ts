import { describe, expect, it } from "vitest";

import { selectRestoreChanges } from "./restore-merge";

describe("backup restore merge", () => {
  it("adds missing records and replaces only older matching records", () => {
    const current = [
      { id: "newer-local", updatedAt: "2026-07-23T12:00:00.000Z" },
      { id: "older-local", updatedAt: "2026-07-21T12:00:00.000Z" },
    ];
    const incoming = [
      { id: "newer-local", updatedAt: "2026-07-22T12:00:00.000Z" },
      { id: "older-local", updatedAt: "2026-07-22T12:00:00.000Z" },
      { id: "missing", updatedAt: "2026-07-20T12:00:00.000Z" },
    ];

    expect(selectRestoreChanges(current, incoming)).toEqual([
      {
        previous: current[1],
        value: incoming[1],
      },
      {
        previous: undefined,
        value: incoming[2],
      },
    ]);
  });

  it("deduplicates backup records by keeping the newest copy", () => {
    const older = { id: "same", updatedAt: "2026-07-20T12:00:00.000Z" };
    const newer = { id: "same", updatedAt: "2026-07-21T12:00:00.000Z" };

    expect(selectRestoreChanges([], [older, newer])).toEqual([
      { previous: undefined, value: newer },
    ]);
  });
});
