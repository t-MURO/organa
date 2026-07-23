import type { CreateTaskInput } from "./tasks";

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
      plannedFor: undefined,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
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
