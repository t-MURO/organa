import type { TaskTemplate } from "@organa/domain";

export interface TemplateRepository {
  initialize(): Promise<void>;
  list(): Promise<TaskTemplate[]>;
  upsert(template: TaskTemplate): Promise<void>;
  remove(id: string): Promise<void>;
}
