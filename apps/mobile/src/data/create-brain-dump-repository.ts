import type { BrainDumpRepository } from "./brain-dump-repository.types";

export function createBrainDumpRepository(
  _namespace = "local",
): BrainDumpRepository {
  throw new Error(
    "A platform-specific Brain Dump repository was not selected.",
  );
}
