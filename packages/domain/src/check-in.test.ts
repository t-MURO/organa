import { describe, expect, it } from "vitest";

import {
  checkInTrend,
  createCheckInEntry,
  searchCheckInEntries,
  updateCheckInEntry,
} from "./check-in";

const morning = new Date("2026-07-23T08:00:00.000Z");
const evening = new Date("2026-07-23T18:00:00.000Z");

describe("Check-In", () => {
  it("creates an optional, dated mood entry", () => {
    const entry = createCheckInEntry(
      {
        date: "2026-07-23",
        mood: 4,
        feeling: " steady ",
        reflection: " Took a proper break. ",
      },
      "check-in-1",
      morning,
    );

    expect(entry).toMatchObject({
      date: "2026-07-23",
      mood: 4,
      feeling: "steady",
      reflection: "Took a proper break.",
      createdAt: morning.toISOString(),
    });
  });

  it("keeps the original date and creation time when editing", () => {
    const entry = createCheckInEntry(
      { date: "2026-07-23", mood: 3 },
      "check-in-1",
      morning,
    );
    const updated = updateCheckInEntry(
      entry,
      { mood: 5, feeling: "hopeful" },
      evening,
    );

    expect(updated.date).toBe("2026-07-23");
    expect(updated.createdAt).toBe(morning.toISOString());
    expect(updated.updatedAt).toBe(evening.toISOString());
    expect(updated.mood).toBe(5);
  });

  it("enforces a one-word optional feeling", () => {
    expect(() =>
      createCheckInEntry(
        { date: "2026-07-23", mood: 3, feeling: "a bit tired" },
        "check-in-1",
      ),
    ).toThrow("one word");
  });

  it("searches reflections and limits trends without filling missed days", () => {
    const older = createCheckInEntry(
      {
        date: "2026-07-10",
        mood: 2,
        reflection: "A noisy day",
      },
      "older",
      morning,
    );
    const recent = createCheckInEntry(
      {
        date: "2026-07-22",
        mood: 4,
        feeling: "calm",
      },
      "recent",
      evening,
    );

    expect(searchCheckInEntries([older, recent], "NOISY")).toEqual([older]);
    expect(checkInTrend([older, recent], "2026-07-23", 7)).toEqual([recent]);
    expect(checkInTrend([older, recent], "2026-07-23", 30)).toEqual([
      older,
      recent,
    ]);
  });
});
