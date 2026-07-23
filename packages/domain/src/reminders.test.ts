import { describe, expect, it } from "vitest";

import { buildTaskReminderSchedule } from "./reminders";
import { createTask } from "./tasks";

describe("buildTaskReminderSchedule", () => {
  it("places reminders before, at, and after the due time", () => {
    const task = createTask(
      {
        title: "Water plants",
        dueAt: "2026-08-01T12:00:00.000Z",
        reminders: [
          {
            id: "before",
            enabled: true,
            offsetMinutes: 15,
            stage: "before_due",
          },
          {
            id: "at",
            enabled: true,
            offsetMinutes: 0,
            stage: "at_due",
          },
          {
            id: "after",
            enabled: true,
            offsetMinutes: 30,
            stage: "after_due",
          },
        ],
      },
      "task-1",
    );

    const schedule = buildTaskReminderSchedule(
      task,
      new Date("2026-08-01T10:00:00.000Z"),
    );

    expect(schedule.map((item) => item.triggerAt.toISOString())).toEqual([
      "2026-08-01T11:45:00.000Z",
      "2026-08-01T12:00:00.000Z",
      "2026-08-01T12:30:00.000Z",
    ]);
  });

  it("ignores disabled, expired, and completed reminders", () => {
    const task = createTask(
      {
        title: "Medication",
        dueAt: "2026-08-01T12:00:00.000Z",
        reminders: [
          {
            id: "expired",
            enabled: true,
            offsetMinutes: 30,
            stage: "before_due",
          },
          {
            id: "disabled",
            enabled: false,
            offsetMinutes: 0,
            stage: "at_due",
          },
        ],
      },
      "task-2",
    );

    expect(
      buildTaskReminderSchedule(
        task,
        new Date("2026-08-01T11:45:00.000Z"),
      ),
    ).toEqual([]);
    expect(
      buildTaskReminderSchedule(
        { ...task, completedAt: "2026-08-01T11:00:00.000Z" },
        new Date("2026-08-01T10:00:00.000Z"),
      ),
    ).toEqual([]);
  });
});
