import {
  formatLocalDate,
  type Reminder,
  type Task,
  type TaskSubtask,
} from "@organa/domain";

export interface TaskDeadlineFields {
  dueDate: string;
  dueTime: string;
}

export interface TaskDeadlineValue {
  dueAt?: string;
  dueDate?: string;
}

export function readTaskDeadline(
  task?: Pick<Task, "dueAt" | "dueDate">,
): TaskDeadlineFields {
  const dueAt = task?.dueAt ? new Date(task.dueAt) : undefined;
  const validDueAt =
    dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : undefined;

  return {
    dueDate: task?.dueDate ?? (validDueAt ? formatLocalDate(validDueAt) : ""),
    dueTime: validDueAt ? formatTime(validDueAt) : "",
  };
}

export function createTaskDeadline(
  dueDate: string,
  dueTime: string,
): TaskDeadlineValue {
  if (!dueDate) return {};
  if (!dueTime) return { dueDate };

  return {
    dueAt: new Date(`${dueDate}T${dueTime}:00`).toISOString(),
    dueDate,
  };
}

export function materializeInheritedSubtaskReminders(
  subtasks: TaskSubtask[],
  parentReminders: Reminder[],
) {
  return subtasks.map((subtask) =>
    subtask.reminders === undefined
      ? {
          ...subtask,
          reminders: parentReminders.map((reminder) => ({ ...reminder })),
        }
      : subtask,
  );
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}
