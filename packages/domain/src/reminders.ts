import type { Reminder, Task } from "./tasks";

export interface ScheduledTaskReminder {
  reminder: Reminder;
  triggerAt: Date;
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

function reminderDirection(reminder: Reminder) {
  return reminder.stage === "before_due" ? -1 : 1;
}
