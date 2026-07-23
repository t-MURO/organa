export type MoodRating = 1 | 2 | 3 | 4 | 5;

export interface CheckInEntry {
  id: string;
  date: string;
  mood: MoodRating;
  feeling?: string;
  reflection?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckInInput {
  date: string;
  mood: MoodRating;
  feeling?: string;
  reflection?: string;
}

export function createCheckInEntry(
  input: CheckInInput,
  id: string,
  now = new Date(),
): CheckInEntry {
  assertMood(input.mood);
  const timestamp = now.toISOString();

  return {
    id,
    date: input.date,
    mood: input.mood,
    feeling: normalizeFeeling(input.feeling),
    reflection: input.reflection?.trim() || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateCheckInEntry(
  entry: CheckInEntry,
  input: Omit<CheckInInput, "date">,
  now = new Date(),
): CheckInEntry {
  assertMood(input.mood);

  return {
    ...entry,
    mood: input.mood,
    feeling: normalizeFeeling(input.feeling),
    reflection: input.reflection?.trim() || undefined,
    updatedAt: now.toISOString(),
  };
}

export function sortCheckInEntries(
  entries: CheckInEntry[],
): CheckInEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function searchCheckInEntries(
  entries: CheckInEntry[],
  query: string,
): CheckInEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const ordered = sortCheckInEntries(entries);

  if (!normalizedQuery) return ordered;

  return ordered.filter((entry) =>
    [entry.date, entry.feeling, entry.reflection].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery),
    ),
  );
}

export function checkInTrend(
  entries: CheckInEntry[],
  today: string,
  rangeDays: 7 | 30,
): CheckInEntry[] {
  const end = parseLocalDate(today);
  const start = new Date(end);
  start.setDate(start.getDate() - rangeDays + 1);
  const startDate = formatDate(start);

  return sortCheckInEntries(entries)
    .filter((entry) => entry.date >= startDate && entry.date <= today)
    .reverse();
}

function assertMood(mood: number): asserts mood is MoodRating {
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) {
    throw new Error("Mood must be a whole number from 1 to 5.");
  }
}

function normalizeFeeling(feeling?: string) {
  const normalized = feeling?.trim();
  if (!normalized) return undefined;

  if (/\s/.test(normalized)) {
    throw new Error("The feeling label must be one word.");
  }

  return normalized;
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
