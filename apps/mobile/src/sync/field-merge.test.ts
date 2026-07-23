import { describe, expect, it } from "vitest";

import { changedFieldNames, mergeVersionedFields } from "./field-merge";

describe("field-level synchronization", () => {
  it("encrypts only fields that changed", () => {
    expect(
      changedFieldNames(
        { id: "task-1", title: "Old", priority: "nice" },
        { id: "task-1", title: "New", priority: "nice" },
      ),
    ).toEqual(["title"]);
  });

  it("merges independent edits without losing either value", () => {
    const initial = "2026-07-23T18:00:00.000Z";
    const titleEdit = "2026-07-23T18:01:00.000Z";
    const priorityEdit = "2026-07-23T18:02:00.000Z";

    const first = mergeVersionedFields(
      { title: "Old", priority: "nice" },
      { title: initial, priority: initial },
      { title: "New" },
      { title: titleEdit },
    );
    const second = mergeVersionedFields(
      first.value,
      first.versions,
      { priority: "must" },
      { priority: priorityEdit },
    );

    expect(second.value).toEqual({ title: "New", priority: "must" });
  });

  it("keeps the latest valid version of the same field", () => {
    const result = mergeVersionedFields(
      { title: "Latest" },
      { title: "2026-07-23T18:03:00.000Z" },
      { title: "Stale" },
      { title: "2026-07-23T18:02:00.000Z" },
    );

    expect(result.value.title).toBe("Latest");
  });
});
