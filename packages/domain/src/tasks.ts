export type TaskKind = "one_off" | "habit" | "medication";
export type TaskPriority = "must" | "should" | "nice";
export type ReminderStage = "before_due" | "at_due" | "after_due";
export type LocalDate = string;
export type LocalTime = string;

export interface Reminder {
  id: string;
  stage: ReminderStage;
  offsetMinutes: number;
  enabled: boolean;
}

export interface TaskSubtask {
  id: string;
  title: string;
  completedAt?: string;
  reminders?: Reminder[];
}

export interface TaskRecurrence {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays?: number[];
}

export interface Task {
  id: string;
  title: string;
  details?: string;
  kind: TaskKind;
  priority: TaskPriority;
  plannedFor?: LocalDate;
  scheduledTime?: LocalTime;
  dueAt?: string;
  estimatedMinutes?: number;
  completedAt?: string;
  recurrence?: TaskRecurrence;
  reminders: Reminder[];
  subtasks: TaskSubtask[];
  snoozePresets: number[];
  graceDays?: number;
  requireDoseConfirmation?: boolean;
  subtaskRemindersEnabled?: boolean;
  seriesId?: string;
  previousOccurrenceId?: string;
  occurrenceNumber?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  details?: string;
  kind?: TaskKind;
  priority?: TaskPriority;
  plannedFor?: LocalDate;
  scheduledTime?: LocalTime;
  dueAt?: string;
  estimatedMinutes?: number;
  recurrence?: TaskRecurrence;
  reminders?: Reminder[];
  subtasks?: TaskSubtask[];
  snoozePresets?: number[];
  graceDays?: number;
  requireDoseConfirmation?: boolean;
  subtaskRemindersEnabled?: boolean;
  seriesId?: string;
  previousOccurrenceId?: string;
  occurrenceNumber?: number;
}

export interface TaskCompletionResult {
  completedTask: Task;
  nextTask?: Task;
}

export interface DayPlan {
  date: LocalDate;
  active: Task[];
  completed: Task[];
  timed: Task[];
  lanes: Record<TaskPriority, Task[]>;
}

export function formatLocalDate(date: Date): LocalDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createTask(
  input: CreateTaskInput,
  id: string,
  now = new Date(),
): Task {
  const title = input.title.trim();

  if (!title) {
    throw new Error("A task title is required.");
  }

  const timestamp = now.toISOString();

  return {
    id,
    title,
    details: input.details?.trim() || undefined,
    kind: input.kind ?? "one_off",
    priority: input.priority ?? "should",
    plannedFor: input.plannedFor,
    scheduledTime: input.scheduledTime,
    dueAt: input.dueAt,
    estimatedMinutes: input.estimatedMinutes,
    recurrence: input.recurrence,
    reminders: input.reminders ?? [],
    subtasks: input.subtasks ?? [],
    snoozePresets: normalizeSnoozePresets(input.snoozePresets),
    graceDays: normalizeGraceDays(input.graceDays),
    requireDoseConfirmation:
      input.kind === "medication"
        ? (input.requireDoseConfirmation ?? false)
        : undefined,
    subtaskRemindersEnabled: input.subtaskRemindersEnabled ?? false,
    seriesId: input.seriesId ?? (input.recurrence ? id : undefined),
    previousOccurrenceId: input.previousOccurrenceId,
    occurrenceNumber: input.occurrenceNumber ?? (input.recurrence ? 1 : undefined),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateTask(
  task: Task,
  input: CreateTaskInput,
  now = new Date(),
): Task {
  const replacement = createTask(input, task.id, now);

  return {
    ...replacement,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    seriesId: task.seriesId,
    previousOccurrenceId: task.previousOccurrenceId,
    occurrenceNumber: task.occurrenceNumber,
    updatedAt: now.toISOString(),
  };
}

export function completeTaskOccurrence(
  task: Task,
  nextId: string,
  now = new Date(),
): TaskCompletionResult {
  const completedTask = {
    ...completeTask(task, now),
    seriesId: task.seriesId ?? (task.recurrence ? task.id : undefined),
    occurrenceNumber:
      task.occurrenceNumber ?? (task.recurrence ? 1 : undefined),
  };

  if (!task.recurrence || !task.plannedFor) {
    return { completedTask };
  }

  const nextPlannedFor = addRecurrenceToLocalDate(
    task.plannedFor,
    task.recurrence,
  );
  const nextTask = createTask(
    {
      title: task.title,
      details: task.details,
      kind: task.kind,
      priority: task.priority,
      plannedFor: nextPlannedFor,
      scheduledTime: task.scheduledTime,
      dueAt: task.dueAt
        ? addRecurrenceToDate(new Date(task.dueAt), task.recurrence).toISOString()
        : undefined,
      estimatedMinutes: task.estimatedMinutes,
      recurrence: task.recurrence,
      reminders: task.reminders,
      subtasks: task.subtasks.map((subtask) => ({
        ...subtask,
        completedAt: undefined,
      })),
      snoozePresets: task.snoozePresets,
      graceDays: task.graceDays,
      requireDoseConfirmation: task.requireDoseConfirmation,
      subtaskRemindersEnabled: task.subtaskRemindersEnabled,
      seriesId: completedTask.seriesId,
      previousOccurrenceId: task.id,
      occurrenceNumber: (completedTask.occurrenceNumber ?? 1) + 1,
    },
    nextId,
    now,
  );

  return { completedTask, nextTask };
}

export function completeTask(task: Task, now = new Date()): Task {
  if (task.completedAt) {
    return task;
  }

  const timestamp = now.toISOString();
  return {
    ...task,
    completedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function reopenTask(task: Task, now = new Date()): Task {
  if (!task.completedAt) {
    return task;
  }

  return {
    ...task,
    completedAt: undefined,
    updatedAt: now.toISOString(),
  };
}

export function toggleSubtaskCompletion(
  task: Task,
  subtaskId: string,
  now = new Date(),
): Task {
  const timestamp = now.toISOString();
  let found = false;
  const subtasks = task.subtasks.map((subtask) => {
    if (subtask.id !== subtaskId) return subtask;
    found = true;

    return {
      ...subtask,
      completedAt: subtask.completedAt ? undefined : timestamp,
    };
  });

  return found ? { ...task, subtasks, updatedAt: timestamp } : task;
}

export function buildDayPlan(tasks: Task[], date: LocalDate): DayPlan {
  const dayTasks = tasks.filter((task) => task.plannedFor === date);
  const active = dayTasks.filter((task) => !task.completedAt);
  const completed = dayTasks.filter((task) => Boolean(task.completedAt));
  const timed = active
    .filter((task) => Boolean(task.scheduledTime))
    .sort((left, right) =>
      (left.scheduledTime ?? "").localeCompare(right.scheduledTime ?? ""),
    );

  return {
    date,
    active,
    completed,
    timed,
    lanes: {
      must: active.filter((task) => task.priority === "must"),
      should: active.filter((task) => task.priority === "should"),
      nice: active.filter((task) => task.priority === "nice"),
    },
  };
}

function normalizeSnoozePresets(presets?: number[]) {
  const normalized = (presets ?? [10, 30, 60]).filter(
    (minutes) => Number.isInteger(minutes) && minutes > 0,
  );
  return [...new Set(normalized)].sort((left, right) => left - right);
}

function normalizeGraceDays(graceDays?: number) {
  if (graceDays === undefined) return undefined;
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 3) {
    throw new Error("Grace days must be a whole number from 0 to 3.");
  }
  return graceDays;
}

function addRecurrenceToLocalDate(
  date: LocalDate,
  recurrence: TaskRecurrence,
) {
  const [year, month, day] = date.split("-").map(Number);
  return formatLocalDate(
    addRecurrenceToDate(new Date(year, month - 1, day), recurrence),
  );
}

function addRecurrenceToDate(date: Date, recurrence: TaskRecurrence) {
  const next = new Date(date);

  if (recurrence.frequency === "daily") {
    next.setDate(next.getDate() + recurrence.interval);
    return next;
  }

  if (recurrence.frequency === "weekly") {
    next.setDate(next.getDate() + recurrence.interval * 7);
    return next;
  }

  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + recurrence.interval);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(originalDay, lastDay));
  return next;
}
