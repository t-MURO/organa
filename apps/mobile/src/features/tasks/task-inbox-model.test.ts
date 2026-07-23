import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import { filterTasksForInbox } from "./task-inbox-model";

const now = new Date("2026-08-04T12:00:00.000Z");

describe("task inbox model", () => {
  const tasks = [
    createTask({ title: "Undated note" }, "undated"),
    createTask(
      { plannedFor: "2026-08-04", title: "Today task" },
      "today",
    ),
    createTask(
      { plannedFor: "2026-08-05", title: "Future task" },
      "future",
    ),
    createTask(
      { plannedFor: "2026-08-03", title: "Past plan" },
      "past",
    ),
    {
      ...createTask({ title: "Finished" }, "finished"),
      completedAt: "2026-08-04T10:00:00.000Z",
    },
  ];

  it("keeps every active non-overdue task in the searchable upcoming inbox", () => {
    expect(
      filterTasksForInbox(tasks, "upcoming", "", now).map((task) => task.id),
    ).toEqual(["today", "future", "undated"]);
    expect(
      filterTasksForInbox(tasks, "upcoming", "undated", now).map(
        (task) => task.id,
      ),
    ).toEqual(["undated"]);
  });

  it("classifies planned-only overdue and completed tasks", () => {
    expect(
      filterTasksForInbox(tasks, "overdue", "", now).map((task) => task.id),
    ).toEqual(["past"]);
    expect(
      filterTasksForInbox(tasks, "completed", "", now).map((task) => task.id),
    ).toEqual(["finished"]);
  });

  it("keeps recurring tasks out of overdue during their grace window", () => {
    const recurring = createTask(
      {
        graceDays: 3,
        kind: "habit",
        plannedFor: "2026-08-01",
        recurrence: { frequency: "daily", interval: 1 },
        title: "Gentle routine",
      },
      "routine",
    );

    expect(filterTasksForInbox([recurring], "upcoming", "", now)).toEqual([
      recurring,
    ]);
    expect(filterTasksForInbox([recurring], "overdue", "", now)).toEqual([]);
  });
});
