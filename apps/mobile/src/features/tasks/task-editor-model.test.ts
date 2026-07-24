import { createTask, type Reminder } from "@organa/domain";
import { describe, expect, it } from "vitest";

import {
  createTaskDeadline,
  materializeInheritedSubtaskReminders,
  readTaskDeadline,
} from "./task-editor-model";

describe("task editor deadline model", () => {
  it("round-trips a date-only deadline without inventing a time", () => {
    const deadline = createTaskDeadline("2026-08-15", "");
    const task = createTask(
      { ...deadline, title: "Submit paperwork" },
      "date-only",
    );

    expect(deadline).toEqual({ dueDate: "2026-08-15" });
    expect(readTaskDeadline(task)).toEqual({
      dueDate: "2026-08-15",
      dueTime: "",
    });
  });

  it("round-trips an exact local deadline and supports legacy timestamps", () => {
    const deadline = createTaskDeadline("2026-08-15", "14:30");
    const task = createTask(
      { ...deadline, title: "Submit paperwork" },
      "exact-time",
    );
    const legacy = createTask(
      { dueAt: deadline.dueAt, title: "Legacy deadline" },
      "legacy",
    );

    expect(readTaskDeadline(task)).toEqual({
      dueDate: "2026-08-15",
      dueTime: "14:30",
    });
    expect(readTaskDeadline(legacy)).toEqual({
      dueDate: "2026-08-15",
      dueTime: "14:30",
    });
  });

  it("makes inherited subtask reminders explicit when configuration is enabled", () => {
    const parentReminders: Reminder[] = [
      {
        enabled: true,
        id: "at-due",
        offsetMinutes: 0,
        stage: "at_due",
      },
    ];
    const explicitQuietStep = {
      id: "quiet",
      reminders: [],
      title: "Stay quiet",
    };

    const result = materializeInheritedSubtaskReminders(
      [
        { id: "legacy", title: "Inherited step" },
        explicitQuietStep,
      ],
      parentReminders,
    );

    expect(result[0].reminders).toEqual(parentReminders);
    expect(result[0].reminders).not.toBe(parentReminders);
    expect(result[1]).toBe(explicitQuietStep);
  });
});
