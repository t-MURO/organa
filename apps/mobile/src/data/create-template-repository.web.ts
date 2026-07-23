import type { TaskTemplate } from "@organa/domain";

import { openOrganaDatabase } from "./organa-database.web";
import type { TemplateRepository } from "./template-repository.types";

export function createTemplateRepository(namespace = "local"): TemplateRepository {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async list() {
      const database = await openOrganaDatabase(namespace);
      return database.getAllFromIndex("taskTemplates", "by-updated-at");
    },
    async upsert(template: TaskTemplate) {
      const database = await openOrganaDatabase(namespace);
      await database.put("taskTemplates", template);
    },
    async remove(id: string) {
      const database = await openOrganaDatabase(namespace);
      await database.delete("taskTemplates", id);
    },
  };
}
