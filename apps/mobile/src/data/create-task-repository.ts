import type { Task } from "@organa/domain";

import type { TaskRepository } from "./task-repository.types";

const stores = new Map<string, Map<string, Task>>();

export function createTaskRepository(namespace = "local"): TaskRepository {
  const tasks = stores.get(namespace) ?? new Map<string, Task>();
  stores.set(namespace, tasks);
  return {
    async initialize() {},
    async list() {
      return [...tasks.values()];
    },
    async upsert(task) {
      tasks.set(task.id, task);
    },
    async remove(id) {
      tasks.delete(id);
    },
  };
}
