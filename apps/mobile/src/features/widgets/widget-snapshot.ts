import {
  buildSubtaskReminderSchedule,
  buildTaskReminderSchedule,
  formatLocalDate,
  type Task,
} from "@organa/domain";

export interface WidgetSnapshot {
  nextReminder?: {
    taskId: string;
    time: Date;
    title: string;
  };
  today: {
    remaining: number;
    tasks: string[];
  };
}

export function buildWidgetSnapshot(
  tasks: Task[],
  now = new Date(),
): WidgetSnapshot {
  const today = formatLocalDate(now);
  const todaysTasks = tasks.filter(
    (task) => task.plannedFor === today && !task.completedAt,
  );
  const nextReminder = tasks
    .flatMap((task) => [
      ...buildTaskReminderSchedule(task, now).map((scheduled) => ({
        taskId: task.id,
        time: scheduled.triggerAt,
        title: task.title,
      })),
      ...buildSubtaskReminderSchedule(task, now).map((scheduled) => ({
        taskId: task.id,
        time: scheduled.triggerAt,
        title: `${task.title} / ${scheduled.subtaskTitle}`,
      })),
    ])
    .sort((left, right) => left.time.getTime() - right.time.getTime())[0];

  return {
    nextReminder,
    today: {
      remaining: todaysTasks.length,
      tasks: todaysTasks.map((task) => task.title),
    },
  };
}
