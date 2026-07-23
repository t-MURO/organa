import type { TaskTemplate } from "@organa/domain";

import type { TemplateRepository } from "./template-repository.types";

const templates = new Map<string, TaskTemplate>();

export function createTemplateRepository(): TemplateRepository {
  return {
    async initialize() {},
    async list() {
      return [...templates.values()];
    },
    async upsert(template) {
      templates.set(template.id, template);
    },
    async remove(id) {
      templates.delete(id);
    },
  };
}
