import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import { buildWidgetSnapshot, buildWidgetTimeline } from "./widget-snapshot";

describe("widget snapshot", () => {
  it("shows today's active tasks and the actual next reminder time", () => {
    const tasks = [
      createTask(
        {
          dueAt: "2026-08-01T12:00:00.000Z",
          plannedFor: "2026-08-01",
          reminders: [
            {
              enabled: true,
              id: "before",
              offsetMinutes: 15,
              stage: "before_due",
            },
          ],
          title: "Pack",
        },
        "pack",
      ),
      {
        ...createTask(
          {
            plannedFor: "2026-08-01",
            title: "Already finished",
          },
          "finished",
        ),
        completedAt: "2026-08-01T08:00:00.000Z",
      },
    ];

    const snapshot = buildWidgetSnapshot(
      tasks,
      new Date("2026-08-01T10:00:00.000Z"),
    );

    expect(snapshot.today).toEqual({ remaining: 1, tasks: ["Pack"] });
    expect(snapshot.nextReminder).toEqual({
      taskId: "pack",
      time: new Date("2026-08-01T11:45:00.000Z"),
      title: "Pack",
    });
  });

  it("includes selected subtask reminders but not unscheduled due times", () => {
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
                id: "at",
                offsetMinutes: 0,
                stage: "at_due",
              },
            ],
            title: "Bring keys",
          },
        ],
        title: "Leave home",
      },
      "leave",
    );

    expect(
      buildWidgetSnapshot(
        [task],
        new Date("2026-08-01T10:00:00.000Z"),
      ).nextReminder,
    ).toEqual({
      taskId: "leave",
      time: new Date("2026-08-01T12:00:00.000Z"),
      title: "Leave home / Bring keys",
    });

    expect(
      buildWidgetSnapshot(
        [{ ...task, subtasks: [] }],
        new Date("2026-08-01T10:00:00.000Z"),
      ).nextReminder,
    ).toBeUndefined();
  });
});

describe("widget timeline", () => {
  it("advances the next reminder when its trigger time arrives", () => {
    const task = createTask(
      {
        dueAt: "2026-08-01T12:00:00.000Z",
        reminders: [
          {
            enabled: true,
            id: "before",
            offsetMinutes: 15,
            stage: "before_due",
          },
          {
            enabled: true,
            id: "at",
            offsetMinutes: 0,
            stage: "at_due",
          },
        ],
        title: "Leave home",
      },
      "leave",
    );

    const entries = buildWidgetTimeline(
      [task],
      new Date("2026-08-01T10:00:00.000Z"),
    ).nextReminder;

    expect(
      entries.map((entry) => ({
        date: entry.date.toISOString(),
        next: entry.value?.time.toISOString(),
      })),
    ).toEqual([
      {
        date: "2026-08-01T10:00:00.000Z",
        next: "2026-08-01T11:45:00.000Z",
      },
      {
        date: "2026-08-01T11:45:00.000Z",
        next: "2026-08-01T12:00:00.000Z",
      },
      {
        date: "2026-08-01T12:00:00.000Z",
        next: undefined,
      },
    ]);
  });

  it("rolls today's task list over at local midnight", () => {
    const tasks = [
      createTask(
        { plannedFor: "2026-08-01", title: "Today" },
        "today",
      ),
      createTask(
        { plannedFor: "2026-08-02", title: "Tomorrow" },
        "tomorrow",
      ),
    ];

    const entries = buildWidgetTimeline(
      tasks,
      new Date(2026, 7, 1, 22, 0),
    ).today;

    expect(entries.map((entry) => entry.value.tasks)).toEqual([
      ["Today"],
      ["Tomorrow"],
      [],
    ]);
    expect(entries[1]?.date).toEqual(new Date(2026, 7, 2));
    expect(entries[2]?.date).toEqual(new Date(2026, 7, 3));
  });
});
