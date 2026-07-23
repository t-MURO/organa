import { getTaskTimingState, type Task } from "@organa/domain";

export type InboxFilter = "upcoming" | "overdue" | "completed";

export function filterTasksForInbox(
  tasks: Task[],
  filter: InboxFilter,
  query: string,
  now = new Date(),
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return tasks
    .filter((task) => taskMatchesInboxFilter(task, filter, now))
    .filter((task) =>
      `${task.title} ${task.details ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    )
    .sort((left, right) => taskSortKey(left).localeCompare(taskSortKey(right)));
}

export function taskMatchesInboxFilter(
  task: Task,
  filter: InboxFilter,
  now = new Date(),
) {
  const status = getTaskTimingState(task, now).status;
  if (filter === "completed") return status === "completed";
  if (filter === "overdue") return status === "overdue";
  return status === "active";
}

function taskSortKey(task: Task) {
  return (
    task.plannedFor ??
    task.dueDate ??
    task.dueAt ??
    `undated:${task.updatedAt}`
  );
}
