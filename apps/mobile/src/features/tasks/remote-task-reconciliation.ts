import type { Task } from "@organa/domain";

import type { RemoteRecordChange } from "../../sync/sync-context";

interface RemoteTaskEffects {
  cancelNotifications(taskId: string): void;
  remove(taskId: string): Promise<void>;
  syncNotifications(task: Task): void;
  upsert(task: Task): Promise<void>;
}

export async function reconcileRemoteTaskChange(
  change: RemoteRecordChange<Task>,
  effects: RemoteTaskEffects,
) {
  if (change.operation === "delete") {
    await effects.remove(change.recordId);
    effects.cancelNotifications(change.recordId);
    return;
  }

  if (!change.value) return;
  await effects.upsert(change.value);
  effects.syncNotifications(change.value);
}
