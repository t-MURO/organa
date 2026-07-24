import type { Task } from "@organa/domain";

export function upsertTaskInList(tasks: Task[], task: Task) {
  const index = tasks.findIndex((candidate) => candidate.id === task.id);
  if (index === -1) return [...tasks, task];

  const next = tasks.slice();
  next[index] = task;
  return next;
}

export function removeTaskFromList(tasks: Task[], id: string) {
  return tasks.filter((task) => task.id !== id);
}
