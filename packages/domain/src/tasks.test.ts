import { describe, expect, it } from "vitest";

import {
  buildDayPlan,
  completeTask,
  completeTaskOccurrence,
  confirmMedicationDose,
  createTask,
  getTaskTimingState,
  reopenTask,
  toggleSubtaskCompletion,
  updateTask,
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
    expect(task.snoozePresets).toEqual([10, 30, 60]);
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

  it("edits configuration without rewriting task history", () => {
    const task = createTask(
      {
        title: "Water plants",
        kind: "habit",
        plannedFor: "2026-07-23",
        subtasks: [{ id: "step-1", title: "Check the soil" }],
      },
      "task-1",
      now,
    );
    const updated = updateTask(
      task,
      {
        title: "Water indoor plants",
        kind: "habit",
        plannedFor: "2026-07-24",
        recurrence: { frequency: "weekly", interval: 1 },
        graceDays: 3,
        snoozePresets: [30, 5, 30],
      },
      new Date("2026-07-23T12:00:00.000Z"),
    );

    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
    expect(updated.title).toBe("Water indoor plants");
    expect(updated.recurrence?.frequency).toBe("weekly");
    expect(updated.graceDays).toBe(3);
    expect(updated.snoozePresets).toEqual([5, 30]);
  });

  it("toggles a subtask without completing its parent", () => {
    const task = createTask(
      {
        title: "Prepare bag",
        subtasks: [{ id: "step-1", title: "Pack keys" }],
      },
      "task-1",
      now,
    );
    const updated = toggleSubtaskCompletion(
      task,
      "step-1",
      new Date("2026-07-23T12:00:00.000Z"),
    );

    expect(updated.subtasks[0].completedAt).toBe(
      "2026-07-23T12:00:00.000Z",
    );
    expect(updated.completedAt).toBeUndefined();
  });

  it("keeps optional dose confirmation separate from task completion", () => {
    const medication = createTask(
      {
        kind: "medication",
        requireDoseConfirmation: true,
        title: "Take medication",
      },
      "medication-1",
      now,
    );
    const completedAt = new Date("2026-07-23T12:00:00.000Z");
    const completed = completeTask(medication, completedAt);
    const confirmedAt = new Date("2026-07-23T12:01:00.000Z");
    const confirmed = confirmMedicationDose(completed, confirmedAt);

    expect(completed.completedAt).toBe(completedAt.toISOString());
    expect(completed.doseConfirmedAt).toBeUndefined();
    expect(confirmed.doseConfirmedAt).toBe(confirmedAt.toISOString());
    expect(reopenTask(confirmed, now).doseConfirmedAt).toBeUndefined();
  });

  it("does not confirm a dose for an active, non-medication, or opted-out task", () => {
    const medication = createTask(
      {
        kind: "medication",
        requireDoseConfirmation: true,
        title: "Take medication",
      },
      "medication-1",
      now,
    );
    const ordinary = makeTask("ordinary-1", "Clear the table", "should");

    expect(confirmMedicationDose(medication, now)).toBe(medication);
    expect(confirmMedicationDose(ordinary, now)).toBe(ordinary);
    expect(
      confirmMedicationDose(
        completeTask({ ...medication, requireDoseConfirmation: false }, now),
        now,
      ).doseConfirmedAt,
    ).toBeUndefined();
  });

  it("completes a recurring occurrence and creates the next one", () => {
    const task = createTask(
      {
        title: "Water plants",
        kind: "habit",
        plannedFor: "2026-07-23",
        scheduledTime: "17:30",
        recurrence: { frequency: "weekly", interval: 2 },
        subtasks: [
          {
            id: "step-1",
            title: "Check the soil",
            completedAt: "2026-07-23T08:00:00.000Z",
          },
        ],
      },
      "occurrence-1",
      now,
    );
    const result = completeTaskOccurrence(
      task,
      "occurrence-2",
      new Date("2026-07-23T18:00:00.000Z"),
    );

    expect(result.completedTask.completedAt).toBe(
      "2026-07-23T18:00:00.000Z",
    );
    expect(result.nextTask).toMatchObject({
      id: "occurrence-2",
      plannedFor: "2026-08-06",
      previousOccurrenceId: "occurrence-1",
      occurrenceNumber: 2,
      seriesId: "occurrence-1",
    });
    expect(result.nextTask?.subtasks[0].completedAt).toBeUndefined();
  });

  it("clamps monthly recurrence to the last valid calendar day", () => {
    const task = createTask(
      {
        title: "Monthly review",
        plannedFor: "2027-01-31",
        recurrence: { frequency: "monthly", interval: 1 },
      },
      "occurrence-1",
      now,
    );
    const result = completeTaskOccurrence(task, "occurrence-2", now);
    const nextResult = completeTaskOccurrence(
      result.nextTask!,
      "occurrence-3",
      now,
    );

    expect(result.nextTask?.plannedFor).toBe("2027-02-28");
    expect(result.nextTask?.recurrence?.anchorDay).toBe(31);
    expect(nextResult.nextTask?.plannedFor).toBe("2027-03-31");
  });

  it("preserves a monthly anchor on ordinary edits and resets it after a move", () => {
    const january = createTask(
      {
        plannedFor: "2027-01-31",
        recurrence: { frequency: "monthly", interval: 1 },
        title: "Monthly review",
      },
      "occurrence-1",
      now,
    );
    const february = completeTaskOccurrence(
      january,
      "occurrence-2",
      now,
    ).nextTask!;
    const renamed = updateTask(
      february,
      {
        plannedFor: "2027-02-28",
        recurrence: { frequency: "monthly", interval: 1 },
        title: "Renamed review",
      },
      now,
    );
    const moved = updateTask(
      renamed,
      {
        plannedFor: "2027-02-15",
        recurrence: { frequency: "monthly", interval: 1 },
        title: "Moved review",
      },
      now,
    );

    expect(renamed.recurrence?.anchorDay).toBe(31);
    expect(moved.recurrence?.anchorDay).toBe(15);
  });

  it("moves through selected weekdays and then skips interval weeks", () => {
    const task = createTask(
      {
        plannedFor: "2026-07-21",
        recurrence: {
          frequency: "weekly",
          interval: 2,
          weekdays: [4, 2, 4],
        },
        title: "Movement",
      },
      "occurrence-1",
      now,
    );
    const thursday = completeTaskOccurrence(
      task,
      "occurrence-2",
      new Date("2026-07-21T18:00:00.000Z"),
    );
    const followingTuesday = completeTaskOccurrence(
      thursday.nextTask!,
      "occurrence-3",
      new Date("2026-07-23T18:00:00.000Z"),
    );

    expect(task.recurrence?.weekdays).toEqual([2, 4]);
    expect(thursday.nextTask?.plannedFor).toBe("2026-07-23");
    expect(followingTuesday.nextTask?.plannedFor).toBe("2026-08-04");
  });

  it("shifts the due time by the same calendar distance as the occurrence", () => {
    const task = createTask(
      {
        dueAt: "2026-07-21T18:30:00.000Z",
        dueDate: "2026-07-21",
        plannedFor: "2026-07-21",
        recurrence: {
          frequency: "weekly",
          interval: 1,
          weekdays: [2, 4],
        },
        title: "Evening routine",
      },
      "occurrence-1",
      now,
    );

    const result = completeTaskOccurrence(
      task,
      "occurrence-2",
      new Date("2026-07-21T19:00:00.000Z"),
    );

    expect(result.nextTask?.plannedFor).toBe("2026-07-23");
    expect(result.nextTask?.dueDate).toBe("2026-07-23");
    expect(result.nextTask?.dueAt).toBe("2026-07-23T18:30:00.000Z");
  });

  it("shifts a date-only deadline without adding an exact time", () => {
    const task = createTask(
      {
        dueDate: "2026-07-22",
        plannedFor: "2026-07-21",
        recurrence: { frequency: "weekly", interval: 1 },
        title: "Weekly paperwork",
      },
      "occurrence-1",
      now,
    );

    const result = completeTaskOccurrence(
      task,
      "occurrence-2",
      new Date("2026-07-21T19:00:00.000Z"),
    );

    expect(result.nextTask?.plannedFor).toBe("2026-07-28");
    expect(result.nextTask?.dueDate).toBe("2026-07-29");
    expect(result.nextTask?.dueAt).toBeUndefined();
  });

  it("does not materialize a backlog of missed recurring dates", () => {
    const task = createTask(
      {
        plannedFor: "2026-07-01",
        recurrence: { frequency: "daily", interval: 1 },
        title: "Daily reset",
      },
      "occurrence-1",
      now,
    );

    const result = completeTaskOccurrence(
      task,
      "occurrence-2",
      new Date("2026-07-23T18:00:00.000Z"),
    );

    expect(result.nextTask?.plannedFor).toBe("2026-07-24");
    expect(result.nextTask?.occurrenceNumber).toBe(2);
  });

  it("rejects invalid recurrence rules at the domain boundary", () => {
    expect(() =>
      createTask(
        {
          plannedFor: "2026-07-23",
          recurrence: { frequency: "daily", interval: 0 },
          title: "Invalid interval",
        },
        "invalid",
        now,
      ),
    ).toThrow("positive whole number");
    expect(() =>
      createTask(
        {
          plannedFor: "2026-07-23",
          recurrence: {
            frequency: "weekly",
            interval: 1,
            weekdays: [7],
          },
          title: "Invalid weekday",
        },
        "invalid",
        now,
      ),
    ).toThrow("between 0 and 6");
  });

  it("rejects impossible planned and due calendar dates", () => {
    expect(() =>
      createTask(
        { plannedFor: "2026-02-30", title: "Invalid plan" },
        "invalid-plan",
        now,
      ),
    ).toThrow("planned date");
    expect(() =>
      createTask(
        { dueDate: "2026-13-01", title: "Invalid deadline" },
        "invalid-due",
        now,
      ),
    ).toThrow("due date");
  });
});

describe("task timing", () => {
  it("uses a date-only deadline without inventing an exact due time", () => {
    const task = createTask(
      {
        dueDate: "2026-07-24",
        plannedFor: "2026-07-20",
        title: "Submit paperwork",
      },
      "date-only",
      now,
    );

    expect(task.dueAt).toBeUndefined();
    expect(
      getTaskTimingState(task, new Date(2026, 6, 24, 23, 59)).status,
    ).toBe("active");
    expect(
      getTaskTimingState(task, new Date(2026, 6, 25, 12)).status,
    ).toBe("overdue");
  });

  it("uses recurring grace days as a calendar cushion before overdue", () => {
    const task = createTask(
      {
        graceDays: 3,
        kind: "habit",
        plannedFor: "2026-07-23",
        recurrence: { frequency: "daily", interval: 1 },
        title: "Brush teeth",
      },
      "routine",
      now,
    );

    expect(
      getTaskTimingState(task, new Date("2026-07-26T20:00:00.000Z")),
    ).toEqual({
      graceDaysRemaining: 0,
      graceDaysUsed: 3,
      inGracePeriod: true,
      status: "active",
    });
    expect(
      getTaskTimingState(task, new Date("2026-07-27T00:01:00.000Z")),
    ).toEqual({
      graceDaysRemaining: 0,
      graceDaysUsed: 3,
      inGracePeriod: false,
      status: "overdue",
    });
  });

  it("applies the cushion to due times without changing one-off deadlines", () => {
    const recurring = createTask(
      {
        dueAt: "2026-07-23T12:00:00.000Z",
        graceDays: 1,
        kind: "medication",
        plannedFor: "2026-07-23",
        recurrence: { frequency: "daily", interval: 1 },
        title: "Medication",
      },
      "medication",
      now,
    );
    const oneOff = createTask(
      {
        dueAt: "2026-07-23T12:00:00.000Z",
        graceDays: 3,
        title: "Submit form",
      },
      "form",
      now,
    );

    expect(
      getTaskTimingState(
        recurring,
        new Date("2026-07-24T11:59:00.000Z"),
      ).status,
    ).toBe("active");
    expect(
      getTaskTimingState(
        recurring,
        new Date("2026-07-24T12:01:00.000Z"),
      ),
    ).toEqual({
      graceDaysRemaining: 0,
      graceDaysUsed: 1,
      inGracePeriod: false,
      status: "overdue",
    });
    expect(
      getTaskTimingState(oneOff, new Date("2026-07-23T12:01:00.000Z")).status,
    ).toBe("overdue");
    expect(oneOff.graceDays).toBeUndefined();
  });

  it("keeps completed and undated tasks in explicit states", () => {
    const undated = createTask({ title: "A thought" }, "undated", now);
    const completed = completeTask(undated, now);

    expect(getTaskTimingState(undated, now).status).toBe("active");
    expect(getTaskTimingState(completed, now).status).toBe("completed");
  });
});
