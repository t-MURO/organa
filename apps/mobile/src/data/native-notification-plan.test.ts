import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import {
  buildNativeTaskNotificationPlan,
  resolveNativeNotificationResponse,
} from "./native-notification-plan";

describe("native notification plan", () => {
  it("builds task and subtask requests with local action context", () => {
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
        ],
        snoozePresets: [5, 10, 30],
        subtaskRemindersEnabled: true,
        subtasks: [
          {
            id: "keys",
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
      "task/one",
    );

    const plan = buildNativeTaskNotificationPlan(
      task,
      new Date("2026-08-01T10:00:00.000Z"),
    );

    expect(plan.category).toEqual({
      actions: [
        {
          buttonTitle: "Focus",
          identifier: "focus",
          opensAppToForeground: true,
        },
        {
          buttonTitle: "Snooze 5m",
          identifier: "snooze-5",
          opensAppToForeground: true,
        },
        {
          buttonTitle: "Snooze 10m",
          identifier: "snooze-10",
          opensAppToForeground: true,
        },
      ],
      identifier: "organa-task-one",
    });
    expect(
      plan.requests.map((request) => ({
        body: request.content.body,
        data: request.content.data,
        identifier: request.identifier,
        triggerAt: request.triggerAt.toISOString(),
      })),
    ).toEqual([
      {
        body: "Leave home",
        data: {
          snoozePresets: [5, 10, 30],
          taskId: "task/one",
          taskTitle: "Leave home",
        },
        identifier: "organa:task/one:before",
        triggerAt: "2026-08-01T11:45:00.000Z",
      },
      {
        body: "Bring keys",
        data: {
          snoozePresets: [5, 10, 30],
          subtaskId: "keys",
          subtaskTitle: "Bring keys",
          taskId: "task/one",
          taskTitle: "Leave home",
        },
        identifier: "organa:task/one:at:subtask:keys",
        triggerAt: "2026-08-01T12:00:00.000Z",
      },
    ]);
  });

  it("does not plan notifications for a completed task", () => {
    const task = {
      ...createTask(
        {
          dueAt: "2026-08-01T12:00:00.000Z",
          reminders: [
            {
              enabled: true,
              id: "at",
              offsetMinutes: 0,
              stage: "at_due" as const,
            },
          ],
          title: "Finished",
        },
        "finished",
      ),
      completedAt: "2026-08-01T10:00:00.000Z",
    };

    expect(
      buildNativeTaskNotificationPlan(
        task,
        new Date("2026-08-01T09:00:00.000Z"),
      ).requests,
    ).toEqual([]);
  });
});

describe("native notification responses", () => {
  it("routes check-ins and task taps", () => {
    expect(
      resolveNativeNotificationResponse("default", { route: "/check-in" }),
    ).toEqual({ type: "check_in" });
    expect(
      resolveNativeNotificationResponse("focus", { taskId: "task-1" }),
    ).toEqual({ taskId: "task-1", type: "open_task" });
    expect(resolveNativeNotificationResponse("focus", {})).toEqual({
      type: "ignore",
    });
  });

  it("builds a repeatable, categorized subtask snooze", () => {
    const data = {
      snoozePresets: [10, 30],
      subtaskId: "step-1",
      subtaskTitle: "Put clothes away",
      taskId: "task-1",
      taskTitle: "Reset bedroom",
    };

    expect(resolveNativeNotificationResponse("snooze-10", data)).toEqual({
      content: {
        body: "Put clothes away",
        categoryIdentifier: "organa-task-1",
        data,
        sound: false,
        subtitle: "Reset bedroom",
        title: "A gentle reminder",
      },
      seconds: 600,
      type: "snooze",
    });
    expect(
      resolveNativeNotificationResponse("snooze-not-a-number", data),
    ).toEqual({ taskId: "task-1", type: "open_task" });
  });
});
