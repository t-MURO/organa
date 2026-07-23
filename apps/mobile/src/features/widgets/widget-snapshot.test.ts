import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import { buildWidgetSnapshot } from "./widget-snapshot";

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
