import type { Task } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.web";
import type { TaskRepository } from "./task-repository.types";

export function createTaskRepository(): TaskRepository {
  return {
    async initialize() {
      await openOrganaDatabase();
    },
    async list() {
      const database = await openOrganaDatabase();
      return database.getAllFromIndex("tasks", "by-updated-at");
    },
    async upsert(task: Task) {
      const database = await openOrganaDatabase();
      await database.put("tasks", task);
    },
    async remove(id: string) {
      const database = await openOrganaDatabase();
      await database.delete("tasks", id);
    },
  };
}
