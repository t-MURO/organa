const legacyKey = "organa:shown-reminders";
const prefix = `${legacyKey}:`;

export function readShownReminderKeys(ownerId: string) {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(storageKey(ownerId)) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

export function rememberShownReminder(
  ownerId: string,
  reminderKey: string,
  keys: Set<string>,
) {
  keys.add(reminderKey);
  const bounded = [...keys].slice(-200);
  keys.clear();
  bounded.forEach((key) => keys.add(key));
  try {
    sessionStorage.setItem(storageKey(ownerId), JSON.stringify(bounded));
  } catch {
    // A private browser may block session storage; the in-memory set still works.
  }
}

export function clearShownReminderHistory() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key === legacyKey || key?.startsWith(prefix)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Private browsers may block session storage; there is nothing else to clear.
  }
}

function storageKey(ownerId: string) {
  return `${prefix}${encodeURIComponent(ownerId)}`;
}
