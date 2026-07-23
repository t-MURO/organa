import { describe, expect, it } from "vitest";

import {
  buildDayPlan,
  completeTask,
  createTask,
  reopenTask,
} from "./tasks";

const now = new Date("2026-07-23T09:00:00.000Z");

function makeTask(
  id: string,
  title: string,
  priority: "must" | "should" | "nice",
  scheduledTime?: string,
) {
  return createTask(
    {
      title,
      priority,
      plannedFor: "2026-07-23",
      scheduledTime,
    },
    id,
    now,
  );
}

describe("task planning", () => {
  it("groups active tasks into calm priority lanes", () => {
    const must = makeTask("1", "Take medication", "must");
    const should = makeTask("2", "Water plants", "should");
    const completed = completeTask(
      makeTask("3", "Brush teeth", "nice"),
      new Date("2026-07-23T10:00:00.000Z"),
    );

    const plan = buildDayPlan([must, should, completed], "2026-07-23");

    expect(plan.lanes.must).toEqual([must]);
    expect(plan.lanes.should).toEqual([should]);
    expect(plan.lanes.nice).toEqual([]);
    expect(plan.completed).toEqual([completed]);
  });

  it("puts only scheduled tasks in time order", () => {
    const afternoon = makeTask("1", "Walk outside", "nice", "16:30");
    const morning = makeTask("2", "Take medication", "must", "08:00");
    const unscheduled = makeTask("3", "Tidy desk", "should");

    const plan = buildDayPlan(
      [afternoon, morning, unscheduled],
      "2026-07-23",
    );

    expect(plan.timed.map((task) => task.id)).toEqual(["2", "1"]);
  });
});

describe("task transitions", () => {
  it("trims titles and applies low-pressure defaults", () => {
    const task = createTask(
      { title: "  Clear the table  ", plannedFor: "2026-07-23" },
      "task-1",
      now,
    );

    expect(task.title).toBe("Clear the table");
    expect(task.kind).toBe("one_off");
    expect(task.priority).toBe("should");
    expect(task.reminders).toEqual([]);
  });

  it("completes and reopens a task without mutating the source", () => {
    const task = makeTask("1", "Take medication", "must");
    const completed = completeTask(
      task,
      new Date("2026-07-23T10:00:00.000Z"),
    );
    const reopened = reopenTask(
      completed,
      new Date("2026-07-23T11:00:00.000Z"),
    );

    expect(task.completedAt).toBeUndefined();
    expect(completed.completedAt).toBe("2026-07-23T10:00:00.000Z");
    expect(reopened.completedAt).toBeUndefined();
    expect(reopened.updatedAt).toBe("2026-07-23T11:00:00.000Z");
  });
});
