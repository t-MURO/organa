import { createTask } from "@organa/domain";
import { describe, expect, it } from "vitest";

import { removeTaskFromList, upsertTaskInList } from "./task-state-model";

const now = new Date("2026-07-24T08:00:00.000Z");

describe("task state model", () => {
  it("appends a new task without changing existing task references", () => {
    const first = createTask({ title: "First" }, "first", now);
    const second = createTask({ title: "Second" }, "second", now);

    const result = upsertTaskInList([first], second);

    expect(result).toEqual([first, second]);
    expect(result[0]).toBe(first);
  });

  it("replaces and removes tasks while preserving list order", () => {
    const first = createTask({ title: "First" }, "first", now);
    const second = createTask({ title: "Second" }, "second", now);
    const updated = { ...first, title: "Updated" };

    const replaced = upsertTaskInList([first, second], updated);

    expect(replaced).toEqual([updated, second]);
    expect(removeTaskFromList(replaced, "first")).toEqual([second]);
  });
});
