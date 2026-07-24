import type { TaskSnoozeScheduler } from "./task-snooze-scheduler.types";
import {
  taskSnoozeEvent,
  type TaskSnoozeEventDetail,
} from "./task-snooze-scheduler.types";

const pendingTimers = new Map<string, Set<number>>();

export function createTaskSnoozeScheduler(): TaskSnoozeScheduler {
  return {
    async schedule(task, minutes, ownerId) {
      if (!task.snoozePresets.includes(minutes)) {
        throw new Error("The snooze preset is not available for this task.");
      }
      if (!ownerId || typeof window === "undefined") {
        return { delivery: "unsupported" };
      }

      const detail: TaskSnoozeEventDetail = {
        body: `${task.title} is ready when you are.`,
        key: `task:${task.id}:snooze:${Date.now()}`,
        ownerId,
        route: "/focus",
        snoozedForMinutes: minutes,
        snoozePresets: task.snoozePresets,
        taskId: task.id,
        title: "A snoozed task is ready",
      };
      const timer = window.setTimeout(() => {
        forgetTimer(ownerId, timer);
        window.dispatchEvent(
          new CustomEvent<TaskSnoozeEventDetail>(taskSnoozeEvent, {
            detail,
          }),
        );
      }, minutes * 60 * 1_000);
      const timers = pendingTimers.get(ownerId) ?? new Set<number>();
      timers.add(timer);
      pendingTimers.set(ownerId, timers);
      return { delivery: "in_app" };
    },
  };
}

export function clearPendingTaskSnoozes(ownerId?: string) {
  if (typeof window === "undefined") {
    pendingTimers.clear();
    return;
  }
  const owners = ownerId ? [ownerId] : [...pendingTimers.keys()];
  for (const owner of owners) {
    pendingTimers.get(owner)?.forEach((timer) => window.clearTimeout(timer));
    pendingTimers.delete(owner);
  }
}

function forgetTimer(ownerId: string, timer: number) {
  const timers = pendingTimers.get(ownerId);
  if (!timers) return;
  timers.delete(timer);
  if (timers.size === 0) pendingTimers.delete(ownerId);
}
