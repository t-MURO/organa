import {
  createTask,
  createUserSettings,
  type CreateTaskInput,
} from "@organa/domain";
import { describe, expect, it } from "vitest";

import {
  buildCheckInWebPushSchedule,
  buildTaskWebPushSchedule,
} from "./web-push-plan";

describe("web push plans", () => {
  it("stores only opaque task routing and timing metadata", () => {
    const input: CreateTaskInput = {
      dueAt: "2026-07-24T18:00:00.000Z",
      reminders: [
        {
          enabled: true,
          id: "at-due",
          offsetMinutes: 0,
          stage: "at_due",
        },
      ],
      subtasks: [
        {
          id: "step-1",
          reminders: [
            {
              enabled: true,
              id: "step-at-due",
              offsetMinutes: 0,
              stage: "at_due",
            },
          ],
          title: "Private step text",
        },
      ],
      subtaskRemindersEnabled: true,
      title: "Private medication text",
    };
    const task = createTask(
      input,
      "task with spaces",
      new Date("2026-07-24T10:00:00.000Z"),
    );

    const plan = buildTaskWebPushSchedule(
      task,
      new Date("2026-07-24T10:00:00.000Z"),
    );
    const serialized = JSON.stringify(plan);

    expect(plan.scope).toBe("task:task%20with%20spaces");
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries[0]?.route).toBe(
      "/focus?taskId=task%20with%20spaces",
    );
    expect(serialized).not.toContain("Private medication text");
    expect(serialized).not.toContain("Private step text");
  });

  it("encodes every opaque identifier into the server-accepted alphabet", () => {
    const task = createTask(
      {
        dueAt: "2026-07-24T18:00:00.000Z",
        reminders: [
          {
            enabled: true,
            id: "reminder's choice",
            offsetMinutes: 0,
            stage: "at_due",
          },
        ],
        title: "Private title",
      },
      "task!(one)",
      new Date("2026-07-24T10:00:00.000Z"),
    );

    expect(
      buildTaskWebPushSchedule(
        task,
        new Date("2026-07-24T10:00:00.000Z"),
      ),
    ).toEqual({
      entries: [
        {
          fireAt: "2026-07-24T18:00:00.000Z",
          key: "task:reminder%27s%20choice",
          route: "/focus?taskId=task%21%28one%29",
        },
      ],
      scope: "task:task%21%28one%29",
    });
  });

  it("keeps the Check-In reminder daily in the selected local timezone", () => {
    const settings = createUserSettings({
      checkInReminder: { enabled: true, time: "20:00" },
    });
    const plan = buildCheckInWebPushSchedule(
      settings,
      new Date("2026-07-24T19:30:00.000Z"),
      "Europe/Berlin",
    );

    expect(plan).toEqual({
      entries: [
        {
          fireAt: "2026-07-25T18:00:00.000Z",
          key: "check-in:daily",
          repeatLocalTime: "20:00",
          route: "/check-in",
          timeZone: "Europe/Berlin",
        },
      ],
      scope: "check-in",
    });
  });

  it("keeps the same local evening time across a daylight-saving change", () => {
    const settings = createUserSettings({
      checkInReminder: { enabled: true, time: "20:00" },
    });

    const beforeChange = buildCheckInWebPushSchedule(
      settings,
      new Date("2026-03-28T20:00:00.000Z"),
      "Europe/Berlin",
    );
    const afterChange = buildCheckInWebPushSchedule(
      settings,
      new Date("2026-03-29T20:00:00.000Z"),
      "Europe/Berlin",
    );

    expect(beforeChange.entries[0]?.fireAt).toBe(
      "2026-03-29T18:00:00.000Z",
    );
    expect(afterChange.entries[0]?.fireAt).toBe(
      "2026-03-30T18:00:00.000Z",
    );
  });

  it("cancels the Check-In scope when the reminder is disabled", () => {
    const settings = createUserSettings();
    expect(buildCheckInWebPushSchedule(settings)).toEqual({
      entries: [],
      scope: "check-in",
    });
  });
});
