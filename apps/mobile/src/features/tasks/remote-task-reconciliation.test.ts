import { createTask } from "@organa/domain";
import { describe, expect, it, vi } from "vitest";

import { reconcileRemoteTaskChange } from "./remote-task-reconciliation";

function createEffects() {
  return {
    cancelNotifications: vi.fn(),
    remove: vi.fn(async () => undefined),
    syncNotifications: vi.fn(),
    upsert: vi.fn(async () => undefined),
  };
}

describe("remote task reconciliation", () => {
  it("persists an incoming task and refreshes its local notifications", async () => {
    const task = createTask({ title: "Water plants" }, "task-1");
    const effects = createEffects();

    await reconcileRemoteTaskChange(
      {
        operation: "upsert",
        recordId: task.id,
        recordType: "task",
        value: task,
      },
      effects,
    );

    expect(effects.upsert).toHaveBeenCalledWith(task);
    expect(effects.syncNotifications).toHaveBeenCalledWith(task);
    expect(effects.remove).not.toHaveBeenCalled();
  });

  it("removes stale notifications when a remote task is deleted", async () => {
    const effects = createEffects();

    await reconcileRemoteTaskChange(
      {
        operation: "delete",
        recordId: "task-1",
        recordType: "task",
      },
      effects,
    );

    expect(effects.remove).toHaveBeenCalledWith("task-1");
    expect(effects.cancelNotifications).toHaveBeenCalledWith("task-1");
    expect(effects.syncNotifications).not.toHaveBeenCalled();
  });
});
