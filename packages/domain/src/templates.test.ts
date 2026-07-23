import { describe, expect, it } from "vitest";

import {
  createTaskTemplate,
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
          plannedFor: "2026-07-23",
          priority: "nice",
        },
      },
      "template-1",
      "user",
      now,
    );

    expect(template.name).toBe("Morning reset");
    expect(template.task.title).toBe("Clear one surface");
    expect(template.task.plannedFor).toBeUndefined();
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
