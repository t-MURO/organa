import type { Task } from "@organa/domain";

export type TaskSnoozeDelivery = "in_app" | "system" | "unsupported";

export interface TaskSnoozeResult {
  delivery: TaskSnoozeDelivery;
}

export interface TaskSnoozeEventDetail {
  body: string;
  key: string;
  route: "/focus";
  snoozedForMinutes: number;
  snoozePresets: number[];
  taskId: string;
  title: string;
}

export interface TaskSnoozeScheduler {
  schedule(task: Task, minutes: number): Promise<TaskSnoozeResult>;
}

export const taskSnoozeEvent = "organa:task-snooze";
