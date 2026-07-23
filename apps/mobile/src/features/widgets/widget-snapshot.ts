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

export interface WidgetTimeline {
  nextReminder: Array<{
    date: Date;
    value: WidgetSnapshot["nextReminder"];
  }>;
  today: Array<{
    date: Date;
    value: WidgetSnapshot["today"];
  }>;
}

export function buildWidgetSnapshot(
  tasks: Task[],
  now = new Date(),
): WidgetSnapshot {
  const today = formatLocalDate(now);
  const todaysTasks = tasks.filter(
    (task) => task.plannedFor === today && !task.completedAt,
  );
  const nextReminder = listReminderCandidates(tasks, now)[0];

  return {
    nextReminder,
    today: {
      remaining: todaysTasks.length,
      tasks: todaysTasks.map((task) => task.title),
    },
  };
}

export function buildWidgetTimeline(
  tasks: Task[],
  now = new Date(),
): WidgetTimeline {
  const todayTransitionDates = new Map<number, Date>([[now.getTime(), now]]);
  const tomorrow = startOfNextLocalDay(now);
  todayTransitionDates.set(tomorrow.getTime(), tomorrow);

  for (const task of tasks) {
    const plannedDate = task.plannedFor
      ? startOfLocalDate(task.plannedFor)
      : undefined;
    if (!plannedDate || plannedDate.getTime() <= now.getTime()) continue;
    todayTransitionDates.set(plannedDate.getTime(), plannedDate);
    const followingDay = startOfNextLocalDay(plannedDate);
    todayTransitionDates.set(followingDay.getTime(), followingDay);
  }

  const reminderTransitionDates = new Map<number, Date>([[now.getTime(), now]]);
  for (const reminder of listReminderCandidates(tasks, now)) {
    reminderTransitionDates.set(reminder.time.getTime(), reminder.time);
  }

  return {
    nextReminder: [...reminderTransitionDates.values()]
      .sort((left, right) => left.getTime() - right.getTime())
      .map((date) => ({
        date,
        value: buildWidgetSnapshot(tasks, date).nextReminder,
      })),
    today: [...todayTransitionDates.values()]
      .sort((left, right) => left.getTime() - right.getTime())
      .map((date) => ({
        date,
        value: buildWidgetSnapshot(tasks, date).today,
      })),
  };
}

function listReminderCandidates(tasks: Task[], now: Date) {
  return tasks
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
    .sort((left, right) => left.time.getTime() - right.time.getTime());
}

function startOfLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatLocalDate(date) === value ? date : undefined;
}

function startOfNextLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
