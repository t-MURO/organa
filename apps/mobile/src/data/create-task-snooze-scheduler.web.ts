import type { TaskSnoozeScheduler } from "./task-snooze-scheduler.types";
import {
  taskSnoozeEvent,
  type TaskSnoozeEventDetail,
} from "./task-snooze-scheduler.types";

export function createTaskSnoozeScheduler(): TaskSnoozeScheduler {
  return {
    async schedule(task, minutes) {
      if (!task.snoozePresets.includes(minutes)) {
        throw new Error("The snooze preset is not available for this task.");
      }
      if (typeof window === "undefined") return { delivery: "unsupported" };

      const detail: TaskSnoozeEventDetail = {
        body: `${task.title} is ready when you are.`,
        key: `task:${task.id}:snooze:${Date.now()}`,
        route: "/focus",
        snoozedForMinutes: minutes,
        snoozePresets: task.snoozePresets,
        taskId: task.id,
        title: "A snoozed task is ready",
      };
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent<TaskSnoozeEventDetail>(taskSnoozeEvent, {
            detail,
          }),
        );
      }, minutes * 60 * 1_000);
      return { delivery: "in_app" };
    },
  };
}
