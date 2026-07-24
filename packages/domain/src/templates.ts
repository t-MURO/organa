import { canTaskKindRepeat, type CreateTaskInput } from "./tasks";

export type TaskTemplateSource = "official" | "user";

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  source: TaskTemplateSource;
  task: CreateTaskInput;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplateInput {
  name: string;
  description?: string;
  task: CreateTaskInput;
}

export function createTaskTemplate(
  input: TaskTemplateInput,
  id: string,
  source: TaskTemplateSource,
  now = new Date(),
): TaskTemplate {
  const name = input.name.trim();
  const title = input.task.title.trim();
  if (!name) throw new Error("A template name is required.");
  if (!title) throw new Error("A template task title is required.");
  if (
    input.task.recurrence &&
    !canTaskKindRepeat(input.task.kind)
  ) {
    throw new Error("One-off task templates cannot repeat.");
  }

  const timestamp = now.toISOString();
  return {
    id,
    name,
    description: input.description?.trim() || undefined,
    source,
    task: {
      ...input.task,
      title,
      details: input.task.details?.trim() || undefined,
      dueAt: undefined,
      dueDate: undefined,
      occurrenceNumber: undefined,
      plannedFor: undefined,
      previousOccurrenceId: undefined,
      seriesId: undefined,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function instantiateTaskTemplate(
  template: TaskTemplate,
  plannedFor: string,
): CreateTaskInput {
  const hasEnabledReminder = template.task.reminders?.some(
    (reminder) => reminder.enabled,
  );
  const dueAt =
    hasEnabledReminder && template.task.scheduledTime
      ? localDateTime(plannedFor, template.task.scheduledTime)
      : undefined;

  return {
    ...template.task,
    dueAt,
    dueDate: dueAt ? plannedFor : undefined,
    plannedFor,
  };
}

export function updateTaskTemplate(
  template: TaskTemplate,
  input: TaskTemplateInput,
  now = new Date(),
): TaskTemplate {
  if (template.source === "official") {
    throw new Error("Official templates must be copied before editing.");
  }

  const updated = createTaskTemplate(input, template.id, "user", now);
  return {
    ...updated,
    createdAt: template.createdAt,
  };
}

function localDateTime(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new Error("A template requires a valid local date and time.");
  }

  const value = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  if (
    value.getFullYear() !== Number(dateMatch[1]) ||
    value.getMonth() !== Number(dateMatch[2]) - 1 ||
    value.getDate() !== Number(dateMatch[3])
  ) {
    throw new Error("A template requires a valid local date and time.");
  }
  return value.toISOString();
}

export function searchTaskTemplates(
  templates: TaskTemplate[],
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  const ordered = [...templates].sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.name.localeCompare(right.name),
  );
  if (!normalized) return ordered;

  return ordered.filter((template) =>
    [template.name, template.description, template.task.title].some((value) =>
      value?.toLocaleLowerCase().includes(normalized),
    ),
  );
}
