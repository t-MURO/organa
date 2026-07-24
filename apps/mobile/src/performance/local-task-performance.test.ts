import {
  buildDayPlan,
  completeTaskOccurrence,
  createTask,
  type Task,
} from "@organa/domain";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { filterTasksForInbox } from "../features/tasks/task-inbox-model";
import { upsertTaskInList } from "../features/tasks/task-state-model";

const INTERACTION_BUDGET_MS = 100;
const DATASET_SIZE = 2_000;
const now = new Date("2026-07-24T12:00:00.000Z");
const today = "2026-07-24";
const tasks = createTypicalDataset();

describe("local task performance contract", () => {
  it("adds a Quick Add task to the local view within 100 ms", () => {
    const result = measureMedian(() => {
      const task = createTask(
        {
          title: "Book the appointment",
          plannedFor: today,
          priority: "must",
        },
        "quick-add",
        now,
      );
      return upsertTaskInList(tasks, task);
    });

    expect(result.value).toHaveLength(DATASET_SIZE + 1);
    expect(result.duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it("completes a recurring task and updates the local view within 100 ms", () => {
    const recurring = createTask(
      {
        title: "Water the plants",
        kind: "habit",
        plannedFor: today,
        recurrence: { frequency: "weekly", interval: 1, weekdays: [5] },
      },
      "recurring",
      now,
    );
    const source = upsertTaskInList(tasks, recurring);

    const result = measureMedian(() => {
      const completion = completeTaskOccurrence(
        recurring,
        "next-occurrence",
        now,
      );
      let next = upsertTaskInList(source, completion.completedTask);
      if (completion.nextTask) {
        next = upsertTaskInList(next, completion.nextTask);
      }
      return next;
    });

    expect(result.value).toHaveLength(DATASET_SIZE + 2);
    expect(result.duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it("builds Today lanes for a typical personal dataset within 100 ms", () => {
    const result = measureMedian(() => buildDayPlan(tasks, today));

    expect(result.value.active.length).toBeGreaterThan(0);
    expect(result.duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it("searches and sorts a typical personal dataset within 100 ms", () => {
    const result = measureMedian(() =>
      filterTasksForInbox(tasks, "completed", "project alpine", now),
    );

    expect(result.value.length).toBeGreaterThan(0);
    expect(result.duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });
});

function createTypicalDataset(): Task[] {
  return Array.from({ length: DATASET_SIZE }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, "0");
    const task = createTask(
      {
        title: `Personal task ${index}`,
        details: index % 14 === 0 ? "Notes for project alpine" : "Everyday note",
        kind: index % 9 === 0 ? "habit" : "one_off",
        plannedFor: index % 5 === 0 ? today : `2026-07-${day}`,
        priority: index % 3 === 0 ? "must" : index % 3 === 1 ? "should" : "nice",
        scheduledTime: index % 4 === 0 ? "09:30" : undefined,
      },
      `task-${index}`,
      now,
    );

    return index % 7 === 0
      ? {
          ...task,
          completedAt: now.toISOString(),
        }
      : task;
  });
}

function measureMedian<T>(operation: () => T) {
  for (let index = 0; index < 3; index += 1) operation();

  const measurements: Array<{ duration: number; value: T }> = [];
  for (let index = 0; index < 9; index += 1) {
    const startedAt = performance.now();
    const value = operation();
    measurements.push({
      duration: performance.now() - startedAt,
      value,
    });
  }

  measurements.sort((left, right) => left.duration - right.duration);
  return measurements[Math.floor(measurements.length / 2)];
}
