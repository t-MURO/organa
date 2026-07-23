import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import { findTaskReminder } from "./in-app-reminder-candidates";

describe("in-app subtask reminders", () => {
  it("uses a subtask's selected reminder", () => {
    const task = createTask(
      {
        dueAt: "2026-08-01T12:00:00.000Z",
        reminders: [],
        subtaskRemindersEnabled: true,
        subtasks: [
          {
            id: "step",
            reminders: [
              {
                enabled: true,
                id: "before",
                offsetMinutes: 15,
                stage: "before_due",
              },
            ],
            title: "Pack the bag",
          },
        ],
        title: "Get ready",
      },
      "task",
    );

    expect(
      findTaskReminder(
        [task],
        new Date("2026-08-01T11:46:00.000Z"),
        new Set(),
      )?.body,
    ).toBe("Step: Pack the bag is coming up.");
  });

  it("does not inherit parent reminders from an explicit empty selection", () => {
    const task = createTask(
      {
        dueAt: "2026-08-01T12:00:00.000Z",
        reminders: [
          {
            enabled: true,
            id: "at",
            offsetMinutes: 0,
            stage: "at_due",
          },
        ],
        subtaskRemindersEnabled: true,
        subtasks: [
          { id: "quiet", reminders: [], title: "Quiet step" },
        ],
        title: "Parent only",
      },
      "task",
    );

    const reminder = findTaskReminder(
      [task],
      new Date("2026-08-01T12:01:00.000Z"),
      new Set(),
    );

    expect(reminder?.body).toBe("Parent only is ready when you are.");
    expect(reminder?.key).not.toContain("quiet");
  });
});
