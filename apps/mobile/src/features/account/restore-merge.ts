export interface RestorableRecord {
  id: string;
  updatedAt: string;
}

export interface RestoreChange<T> {
  previous?: T;
  value: T;
}

export function selectRestoreChanges<T extends RestorableRecord>(
  current: T[],
  incoming: T[],
): RestoreChange<T>[] {
  const currentById = new Map(current.map((record) => [record.id, record]));
  const incomingById = new Map<string, T>();

  for (const record of incoming) {
    const existing = incomingById.get(record.id);
    if (!existing || record.updatedAt > existing.updatedAt) {
      incomingById.set(record.id, record);
    }
  }

  return [...incomingById.values()].flatMap((value) => {
    const previous = currentById.get(value.id);
    if (previous && previous.updatedAt >= value.updatedAt) return [];
    return [{ previous, value }];
  });
}
