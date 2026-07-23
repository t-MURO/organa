import type { Task } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.web";
import type { TaskRepository } from "./task-repository.types";

export function createTaskRepository(namespace = "local"): TaskRepository {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async list() {
      const database = await openOrganaDatabase(namespace);
      return database.getAllFromIndex("tasks", "by-updated-at");
    },
    async upsert(task: Task) {
      const database = await openOrganaDatabase(namespace);
      await database.put("tasks", task);
    },
    async remove(id: string) {
      const database = await openOrganaDatabase(namespace);
      await database.delete("tasks", id);
    },
  };
}
