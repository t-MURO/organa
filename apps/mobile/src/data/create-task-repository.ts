import type { Task } from "@organa/domain";

import type { TaskRepository } from "./task-repository.types";

const tasks = new Map<string, Task>();

export function createTaskRepository(): TaskRepository {
  return {
    async initialize() {},
    async list() {
      return [...tasks.values()];
    },
    async upsert(task) {
      tasks.set(task.id, task);
    },
  };
}
