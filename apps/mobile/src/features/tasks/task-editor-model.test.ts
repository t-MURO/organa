import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import { createTaskDeadline, readTaskDeadline } from "./task-editor-model";

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
});
