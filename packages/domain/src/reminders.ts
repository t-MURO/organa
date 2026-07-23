import type { Reminder, Task } from "./tasks";

export interface ScheduledTaskReminder {
  reminder: Reminder;
  triggerAt: Date;
}

export interface ScheduledSubtaskReminder extends ScheduledTaskReminder {
  subtaskId: string;
  subtaskTitle: string;
}

export function buildTaskReminderSchedule(
  task: Task,
  now = new Date(),
): ScheduledTaskReminder[] {
  if (task.completedAt || !task.dueAt) return [];

  const dueAt = new Date(task.dueAt);
  if (Number.isNaN(dueAt.getTime())) return [];

  return task.reminders
    .filter((reminder) => reminder.enabled)
    .map((reminder) => ({
      reminder,
      triggerAt: new Date(
        dueAt.getTime() +
          reminderDirection(reminder) *
            reminder.offsetMinutes *
            60 *
            1000,
      ),
    }))
    .filter(({ triggerAt }) => triggerAt.getTime() > now.getTime())
    .sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
}

export function buildSubtaskReminderSchedule(
  task: Task,
  now = new Date(),
): ScheduledSubtaskReminder[] {
  if (!task.subtaskRemindersEnabled) return [];
  const taskSchedule = buildTaskReminderSchedule(task, now);
  return task.subtasks
    .filter((subtask) => !subtask.completedAt)
    .flatMap((subtask) =>
      taskSchedule.map((scheduled) => ({
        ...scheduled,
        subtaskId: subtask.id,
        subtaskTitle: subtask.title,
      })),
    );
}

function reminderDirection(reminder: Reminder) {
  return reminder.stage === "before_due" ? -1 : 1;
}
