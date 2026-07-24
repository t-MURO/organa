import type { Reminder, Task } from "@organa/domain";

export interface InAppReminder {
  body: string;
  key: string;
  route: "/check-in" | "/focus";
  subtaskId?: string;
  taskId?: string;
  title: string;
  snoozePresets: number[];
}

const reminderWindowMs = 24 * 60 * 60 * 1_000;

export function findTaskReminder(
  tasks: Task[],
  now: Date,
  shown: Set<string>,
): InAppReminder | undefined {
  const nowTime = now.getTime();
  const candidates = tasks
    .filter((task) => !task.completedAt && task.dueAt)
    .flatMap((task) => {
      const taskReminders = task.reminders.map((reminder) =>
        toCandidate(task, reminder),
      );
      const subtaskReminders = task.subtaskRemindersEnabled
        ? task.subtasks
            .filter((subtask) => !subtask.completedAt)
            .flatMap((subtask) =>
              (subtask.reminders ?? task.reminders).map((reminder) =>
                toCandidate(task, reminder, subtask.id, subtask.title),
              ),
            )
        : [];
      return [...taskReminders, ...subtaskReminders];
    })
    .filter(
      (candidate) =>
        candidate &&
        candidate.triggerAt <= nowTime &&
        nowTime - candidate.triggerAt <= reminderWindowMs &&
        !shown.has(candidate.notice.key),
    )
    .sort((left, right) => right!.triggerAt - left!.triggerAt);

  return candidates[0]?.notice;
}

function toCandidate(
  task: Task,
  reminder: Reminder,
  subtaskId?: string,
  subtaskTitle?: string,
) {
  if (!reminder.enabled || !task.dueAt) return undefined;
  const dueAt = new Date(task.dueAt).getTime();
  if (Number.isNaN(dueAt)) return undefined;
  const direction = reminder.stage === "before_due" ? -1 : 1;
  const triggerAt =
    dueAt + direction * reminder.offsetMinutes * 60 * 1_000;
  const subject = subtaskTitle ? `Step: ${subtaskTitle}` : task.title;
  return {
    notice: {
      body:
        reminder.stage === "before_due"
          ? `${subject} is coming up.`
          : reminder.stage === "after_due"
            ? `${subject} is still here when you are ready.`
            : `${subject} is ready when you are.`,
      key: [
        "task",
        task.id,
        subtaskId ?? "parent",
        reminder.id,
        triggerAt,
      ].join(":"),
      route: "/focus" as const,
      subtaskId,
      snoozePresets: task.snoozePresets,
      taskId: task.id,
      title: "A task is ready",
    },
    triggerAt,
  };
}
