import type { TaskTemplate } from "@organa/domain";

import type { TemplateRepository } from "./template-repository.types";

const stores = new Map<string, Map<string, TaskTemplate>>();

export function createTemplateRepository(namespace = "local"): TemplateRepository {
  const templates = stores.get(namespace) ?? new Map<string, TaskTemplate>();
  stores.set(namespace, templates);
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
