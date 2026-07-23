import type { TaskTemplate } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.web";
import type { TemplateRepository } from "./template-repository.types";

export function createTemplateRepository(): TemplateRepository {
  return {
    async initialize() {
      await openOrganaDatabase();
    },
    async list() {
      const database = await openOrganaDatabase();
      return database.getAllFromIndex("taskTemplates", "by-updated-at");
    },
    async upsert(template: TaskTemplate) {
      const database = await openOrganaDatabase();
      await database.put("taskTemplates", template);
    },
    async remove(id: string) {
      const database = await openOrganaDatabase();
      await database.delete("taskTemplates", id);
    },
  };
}
