export function changedFieldNames(previous: unknown, next: unknown) {
  const previousRecord = asRecord(previous);
  const nextRecord = asRecord(next);
  const fields = new Set([
    ...Object.keys(previousRecord),
    ...Object.keys(nextRecord),
  ]);

  return [...fields].filter(
    (field) =>
      JSON.stringify(previousRecord[field]) !==
        JSON.stringify(nextRecord[field]) ||
      Object.prototype.hasOwnProperty.call(previousRecord, field) !==
        Object.prototype.hasOwnProperty.call(nextRecord, field),
  );
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function mergeVersionedFields<T>(
  current: T,
  currentVersions: Record<string, string>,
  incoming: Partial<T>,
  incomingVersions: Record<string, string>,
) {
  const merged = { ...current };
  const versions = { ...currentVersions };

  for (const field of Object.keys(incomingVersions) as (keyof T & string)[]) {
    if (
      !versions[field] ||
      incomingVersions[field] >= versions[field]
    ) {
      merged[field] = incoming[field] as T[keyof T & string];
      versions[field] = incomingVersions[field];
    }
  }

  return { value: merged, versions };
}
