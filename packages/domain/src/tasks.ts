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
  anchorDay?: number;
}

export interface Task {
  id: string;
  title: string;
  details?: string;
  kind: TaskKind;
  priority: TaskPriority;
  plannedFor?: LocalDate;
  scheduledTime?: LocalTime;
  dueDate?: LocalDate;
  dueAt?: string;
  estimatedMinutes?: number;
  completedAt?: string;
  doseConfirmedAt?: string;
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
  dueDate?: LocalDate;
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

export type TaskTimingStatus = "active" | "completed" | "overdue";

export interface TaskTimingState {
  graceDaysRemaining: number;
  graceDaysUsed: number;
  inGracePeriod: boolean;
  status: TaskTimingStatus;
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

export function getTaskTimingState(
  task: Task,
  now = new Date(),
): TaskTimingState {
  if (task.completedAt) {
    return {
      graceDaysRemaining: 0,
      graceDaysUsed: 0,
      inGracePeriod: false,
      status: "completed",
    };
  }

  const graceDays =
    task.recurrence && task.kind !== "one_off" ? (task.graceDays ?? 0) : 0;
  const dueAt = task.dueAt ? new Date(task.dueAt) : undefined;
  if (dueAt && !Number.isNaN(dueAt.getTime())) {
    const overdueAt = addCalendarDays(dueAt, graceDays);
    const isOverdue = now.getTime() > overdueAt.getTime();
    const inGracePeriod =
      graceDays > 0 &&
      now.getTime() > dueAt.getTime() &&
      now.getTime() <= overdueAt.getTime();
    const graceDaysUsed = isOverdue
      ? graceDays
      : inGracePeriod
        ? Math.min(
            graceDays,
            localDateDistance(
              formatLocalDate(dueAt),
              formatLocalDate(now),
            ),
          )
        : 0;
    return {
      graceDaysRemaining: isOverdue ? 0 : graceDays - graceDaysUsed,
      graceDaysUsed,
      inGracePeriod,
      status: isOverdue ? "overdue" : "active",
    };
  }

  if (task.dueDate && isLocalDate(task.dueDate)) {
    return getLocalDateTimingState(task.dueDate, graceDays, now);
  }

  if (task.plannedFor && isLocalDate(task.plannedFor)) {
    return getLocalDateTimingState(task.plannedFor, graceDays, now);
  }

  return {
    graceDaysRemaining: graceDays,
    graceDaysUsed: 0,
    inGracePeriod: false,
    status: "active",
  };
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
  const kind = input.kind ?? "one_off";
  const plannedFor = normalizeLocalDate(input.plannedFor, "planned date");
  const dueDate = normalizeLocalDate(input.dueDate, "due date");
  const recurrence = normalizeRecurrence(input.recurrence, plannedFor);

  return {
    id,
    title,
    details: input.details?.trim() || undefined,
    kind,
    priority: input.priority ?? "should",
    plannedFor,
    scheduledTime: input.scheduledTime,
    dueDate,
    dueAt: input.dueAt,
    estimatedMinutes: input.estimatedMinutes,
    recurrence,
    reminders: input.reminders ?? [],
    subtasks: input.subtasks ?? [],
    snoozePresets: normalizeSnoozePresets(input.snoozePresets),
    graceDays:
      recurrence && kind !== "one_off"
        ? normalizeGraceDays(input.graceDays)
        : undefined,
    requireDoseConfirmation:
      input.kind === "medication"
        ? (input.requireDoseConfirmation ?? false)
        : undefined,
    subtaskRemindersEnabled: input.subtaskRemindersEnabled ?? false,
    seriesId: input.seriesId ?? (recurrence ? id : undefined),
    previousOccurrenceId: input.previousOccurrenceId,
    occurrenceNumber: input.occurrenceNumber ?? (recurrence ? 1 : undefined),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateTask(
  task: Task,
  input: CreateTaskInput,
  now = new Date(),
): Task {
  const recurrence =
    input.recurrence?.frequency === "monthly" &&
    task.recurrence?.frequency === "monthly" &&
    input.plannedFor === task.plannedFor &&
    input.recurrence.anchorDay === undefined
      ? {
          ...input.recurrence,
          anchorDay: task.recurrence.anchorDay,
        }
      : input.recurrence;
  const replacement = createTask({ ...input, recurrence }, task.id, now);

  return {
    ...replacement,
    completedAt: task.completedAt,
    doseConfirmedAt: task.doseConfirmedAt,
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

  const nextPlannedFor = nextRecurrenceAfterCompletion(
    task.plannedFor,
    task.recurrence,
    now,
  );
  const nextTask = createTask(
    {
      title: task.title,
      details: task.details,
      kind: task.kind,
      priority: task.priority,
      plannedFor: nextPlannedFor,
      scheduledTime: task.scheduledTime,
      dueDate: task.dueDate
        ? shiftLocalDateByOccurrence(
            task.dueDate,
            task.plannedFor,
            nextPlannedFor,
          )
        : undefined,
      dueAt: task.dueAt
        ? shiftDateByLocalDays(
            new Date(task.dueAt),
            task.plannedFor,
            nextPlannedFor,
          ).toISOString()
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

export function confirmMedicationDose(task: Task, now = new Date()): Task {
  if (
    task.kind !== "medication" ||
    !task.requireDoseConfirmation ||
    !task.completedAt ||
    task.doseConfirmedAt
  ) {
    return task;
  }

  const timestamp = now.toISOString();
  return {
    ...task,
    doseConfirmedAt: timestamp,
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
    doseConfirmedAt: undefined,
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

function normalizeLocalDate(
  value: LocalDate | undefined,
  label: string,
): LocalDate | undefined {
  if (value !== undefined && !isLocalDate(value)) {
    throw new Error(`The ${label} must be a valid YYYY-MM-DD date.`);
  }
  return value;
}

function normalizeRecurrence(
  recurrence: TaskRecurrence | undefined,
  plannedFor: LocalDate | undefined,
): TaskRecurrence | undefined {
  if (!recurrence) return undefined;
  if (!Number.isInteger(recurrence.interval) || recurrence.interval <= 0) {
    throw new Error("A recurrence interval must be a positive whole number.");
  }

  if (recurrence.frequency === "weekly") {
    const weekdays = recurrence.weekdays
      ? [...new Set(recurrence.weekdays)].sort((left, right) => left - right)
      : undefined;
    if (
      weekdays?.some(
        (weekday) =>
          !Number.isInteger(weekday) || weekday < 0 || weekday > 6,
      )
    ) {
      throw new Error("Weekly recurrence days must be between 0 and 6.");
    }
    return {
      frequency: recurrence.frequency,
      interval: recurrence.interval,
      weekdays: weekdays?.length ? weekdays : undefined,
    };
  }

  if (recurrence.frequency === "monthly") {
    const plannedDay =
      plannedFor && isLocalDate(plannedFor)
        ? Number(plannedFor.slice(-2))
        : undefined;
    const anchorDay = recurrence.anchorDay ?? plannedDay;
    if (
      anchorDay !== undefined &&
      (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)
    ) {
      throw new Error("A monthly recurrence anchor must be from 1 to 31.");
    }
    return {
      anchorDay,
      frequency: recurrence.frequency,
      interval: recurrence.interval,
    };
  }

  return {
    frequency: recurrence.frequency,
    interval: recurrence.interval,
  };
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

function nextRecurrenceAfterCompletion(
  date: LocalDate,
  recurrence: TaskRecurrence,
  completedAt: Date,
) {
  let nextDate = addRecurrenceToLocalDate(date, recurrence);
  const completedDate = formatLocalDate(completedAt);
  let skipped = 0;

  while (date < completedDate && nextDate <= completedDate) {
    nextDate = addRecurrenceToLocalDate(nextDate, recurrence);
    skipped += 1;
    if (skipped > 10_000) {
      throw new Error("The recurrence is too far behind to advance safely.");
    }
  }

  return nextDate;
}

function addRecurrenceToDate(date: Date, recurrence: TaskRecurrence) {
  const next = new Date(date);

  if (recurrence.frequency === "daily") {
    next.setDate(next.getDate() + recurrence.interval);
    return next;
  }

  if (recurrence.frequency === "weekly") {
    const weekdays = recurrence.weekdays;
    if (!weekdays?.length) {
      next.setDate(next.getDate() + recurrence.interval * 7);
      return next;
    }

    const currentWeekday = next.getDay();
    const laterThisWeek = weekdays.find(
      (weekday) => weekday > currentWeekday,
    );
    const daysUntilNext =
      laterThisWeek !== undefined
        ? laterThisWeek - currentWeekday
        : (recurrence.interval - 1) * 7 +
          (7 - currentWeekday + weekdays[0]);
    next.setDate(next.getDate() + daysUntilNext);
    return next;
  }

  const anchorDay = recurrence.anchorDay ?? next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + recurrence.interval);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(anchorDay, lastDay));
  return next;
}

function shiftDateByLocalDays(
  value: Date,
  from: LocalDate,
  to: LocalDate,
) {
  const shifted = new Date(value);
  shifted.setDate(shifted.getDate() + signedLocalDateDistance(from, to));
  return shifted;
}

function shiftLocalDateByOccurrence(
  value: LocalDate,
  from: LocalDate,
  to: LocalDate,
) {
  return addDaysToLocalDate(value, signedLocalDateDistance(from, to));
}

function getLocalDateTimingState(
  date: LocalDate,
  graceDays: number,
  now: Date,
): TaskTimingState {
  const today = formatLocalDate(now);
  const lastGraceDate = addDaysToLocalDate(date, graceDays);
  const isOverdue = today > lastGraceDate;
  const inGracePeriod = graceDays > 0 && today > date && today <= lastGraceDate;
  const graceDaysUsed = isOverdue
    ? graceDays
    : inGracePeriod
      ? Math.min(graceDays, localDateDistance(date, today))
      : 0;
  return {
    graceDaysRemaining: isOverdue ? 0 : graceDays - graceDaysUsed,
    graceDaysUsed,
    inGracePeriod,
    status: isOverdue ? "overdue" : "active",
  };
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysToLocalDate(value: LocalDate, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return formatLocalDate(new Date(year, month - 1, day + days));
}

function isLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) return false;
  return formatLocalDate(new Date(year, month - 1, day)) === value;
}

function localDateDistance(from: LocalDate, to: LocalDate) {
  return Math.max(0, signedLocalDateDistance(from, to));
}

function signedLocalDateDistance(from: LocalDate, to: LocalDate) {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
}
