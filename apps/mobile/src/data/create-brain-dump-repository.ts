import type { BrainDumpRepository } from "./brain-dump-repository.types";

export function createBrainDumpRepository(): BrainDumpRepository {
  throw new Error(
    "A platform-specific Brain Dump repository was not selected.",
  );
}
