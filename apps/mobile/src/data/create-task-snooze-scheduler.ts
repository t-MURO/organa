import type { TaskSnoozeScheduler } from "./task-snooze-scheduler.types";

export function createTaskSnoozeScheduler(): TaskSnoozeScheduler {
  return {
    async schedule() {
      return { delivery: "unsupported" };
    },
  };
}
