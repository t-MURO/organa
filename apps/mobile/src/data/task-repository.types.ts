import type { Task } from "@organa/domain";

export interface TaskRepository {
  initialize(): Promise<void>;
  list(): Promise<Task[]>;
  upsert(task: Task): Promise<void>;
  remove(id: string): Promise<void>;
}
