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
    updatedAt: now.toISOString(),
  };
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
