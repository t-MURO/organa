import { describe, expect, it } from "vitest";

import {
  createTaskTemplate,
  instantiateTaskTemplate,
  searchTaskTemplates,
  updateTaskTemplate,
} from "./templates";

const now = new Date("2026-07-23T09:00:00.000Z");

describe("task templates", () => {
  it("removes occurrence-specific dates from reusable templates", () => {
    const template = createTaskTemplate(
      {
        name: " Morning reset ",
        task: {
          title: " Clear one surface ",
          dueAt: "2026-07-23T12:00:00.000Z",
          dueDate: "2026-07-23",
          occurrenceNumber: 4,
          plannedFor: "2026-07-23",
          previousOccurrenceId: "task-3",
          priority: "nice",
          seriesId: "series-1",
        },
      },
      "template-1",
      "user",
      now,
    );

    expect(template.name).toBe("Morning reset");
    expect(template.task.title).toBe("Clear one surface");
    expect(template.task.plannedFor).toBeUndefined();
    expect(template.task.dueDate).toBeUndefined();
    expect(template.task.dueAt).toBeUndefined();
    expect(template.task.seriesId).toBeUndefined();
    expect(template.task.previousOccurrenceId).toBeUndefined();
    expect(template.task.occurrenceNumber).toBeUndefined();
  });

  it("anchors template reminders to the selected local day and time", () => {
    const template = createTaskTemplate(
      {
        name: "Morning medication",
        task: {
          title: "Take medication",
          scheduledTime: "08:00",
          reminders: [
            {
              enabled: true,
              id: "at-due",
              offsetMinutes: 0,
              stage: "at_due",
            },
          ],
        },
      },
      "template-medication",
      "official",
      now,
    );

    const task = instantiateTaskTemplate(template, "2026-07-25");
    const dueAt = new Date(task.dueAt!);

    expect(task.plannedFor).toBe("2026-07-25");
    expect(task.dueDate).toBe("2026-07-25");
    expect(dueAt.getFullYear()).toBe(2026);
    expect(dueAt.getMonth()).toBe(6);
    expect(dueAt.getDate()).toBe(25);
    expect(dueAt.getHours()).toBe(8);
    expect(dueAt.getMinutes()).toBe(0);
  });

  it("does not invent a deadline for templates without reminders", () => {
    const template = createTaskTemplate(
      {
        name: "Morning plan",
        task: {
          title: "Review the day",
          scheduledTime: "08:00",
        },
      },
      "template-plan",
      "user",
      now,
    );

    expect(instantiateTaskTemplate(template, "2026-07-25")).toMatchObject({
      dueAt: undefined,
      dueDate: undefined,
      plannedFor: "2026-07-25",
      scheduledTime: "08:00",
    });
  });

  it("preserves identity when a user template is edited", () => {
    const template = createTaskTemplate(
      { name: "Plants", task: { title: "Water plants" } },
      "template-1",
      "user",
      now,
    );
    const updated = updateTaskTemplate(
      template,
      { name: "Indoor plants", task: { title: "Check and water plants" } },
      new Date("2026-07-23T10:00:00.000Z"),
    );

    expect(updated.id).toBe(template.id);
    expect(updated.createdAt).toBe(template.createdAt);
    expect(updated.name).toBe("Indoor plants");
  });

  it("requires official templates to be copied before editing", () => {
    const official = createTaskTemplate(
      { name: "Medication", task: { title: "Take medication" } },
      "official-medication",
      "official",
      now,
    );

    expect(() =>
      updateTaskTemplate(official, {
        name: "Changed",
        task: { title: "Changed" },
      }),
    ).toThrow("copied");
  });

  it("rejects recurrence on a one-off task template", () => {
    expect(() =>
      createTaskTemplate(
        {
          name: "Contradictory template",
          task: {
            kind: "one_off",
            recurrence: { frequency: "daily", interval: 1 },
            title: "One time but repeating",
          },
        },
        "invalid-template",
        "user",
        now,
      ),
    ).toThrow("One-off task templates cannot repeat");
  });

  it("searches names, descriptions, and task titles", () => {
    const plants = createTaskTemplate(
      {
        name: "Plant care",
        description: "A calm weekly routine",
        task: { title: "Water the plants" },
      },
      "plants",
      "official",
      now,
    );

    expect(searchTaskTemplates([plants], "weekly")).toEqual([plants]);
    expect(searchTaskTemplates([plants], "water")).toEqual([plants]);
  });
});
