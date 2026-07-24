import * as SecureStore from "expo-secure-store";

import type { WidgetTimeline } from "./widget-snapshot";

export interface AndroidWidgetSnapshot {
  nextReminder?: {
    deepLink: string;
    time: string;
    title: string;
  };
  today: {
    remaining: number;
    tasks: string[];
  };
}

interface AndroidWidgetTimelineEntry<T> {
  at: string;
  value: T;
}

export interface AndroidWidgetTimeline {
  nextReminder: Array<
    AndroidWidgetTimelineEntry<AndroidWidgetSnapshot["nextReminder"] | null>
  >;
  today: Array<AndroidWidgetTimelineEntry<AndroidWidgetSnapshot["today"]>>;
}

const storageKey = "organa.android-widget-timeline";
const maxTimelineEntries = 64;

export function contentFreeAndroidWidgetSnapshot(): AndroidWidgetSnapshot {
  return {
    today: {
      remaining: 0,
      tasks: [],
    },
  };
}

export function contentFreeAndroidWidgetTimeline(
  now = new Date(),
): AndroidWidgetTimeline {
  return {
    nextReminder: [{ at: now.toISOString(), value: null }],
    today: [
      {
        at: now.toISOString(),
        value: contentFreeAndroidWidgetSnapshot().today,
      },
    ],
  };
}

export function toAndroidWidgetTimeline(
  timeline: WidgetTimeline,
): AndroidWidgetTimeline {
  const nextReminderEntries =
    timeline.nextReminder.length > maxTimelineEntries
      ? [
          ...timeline.nextReminder.slice(0, maxTimelineEntries - 1),
          {
            date: timeline.nextReminder[maxTimelineEntries - 1]!.date,
            value: null,
          },
        ]
      : timeline.nextReminder;
  const todayEntries =
    timeline.today.length > maxTimelineEntries
      ? [
          ...timeline.today.slice(0, maxTimelineEntries - 1),
          {
            date: timeline.today[maxTimelineEntries - 1]!.date,
            value: contentFreeAndroidWidgetSnapshot().today,
          },
        ]
      : timeline.today;

  return {
    nextReminder: nextReminderEntries.map((entry) => ({
      at: entry.date.toISOString(),
      value: entry.value
        ? {
            deepLink: `organa:///focus?taskId=${encodeURIComponent(
              entry.value.taskId,
            )}`,
            time: entry.value.time.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            title: entry.value.title,
          }
        : null,
    })),
    today: todayEntries.map((entry) => ({
      at: entry.date.toISOString(),
      value: entry.value,
    })),
  };
}

export function resolveAndroidWidgetSnapshot(
  timeline: AndroidWidgetTimeline,
  now = new Date(),
): AndroidWidgetSnapshot {
  return {
    nextReminder:
      currentTimelineValue(timeline.nextReminder, now) ?? undefined,
    today:
      currentTimelineValue(timeline.today, now) ??
      contentFreeAndroidWidgetSnapshot().today,
  };
}

export async function loadAndroidWidgetTimeline() {
  try {
    const value = await SecureStore.getItemAsync(storageKey);
    return value
      ? parseAndroidWidgetTimeline(value)
      : contentFreeAndroidWidgetTimeline();
  } catch {
    return contentFreeAndroidWidgetTimeline();
  }
}

export async function saveAndroidWidgetTimeline(
  timeline: AndroidWidgetTimeline,
) {
  await SecureStore.setItemAsync(storageKey, JSON.stringify(timeline));
}

export async function clearAndroidWidgetTimeline() {
  await SecureStore.deleteItemAsync(storageKey);
}

function currentTimelineValue<T>(
  entries: Array<AndroidWidgetTimelineEntry<T>>,
  now: Date,
) {
  let current: T | undefined;
  for (const entry of entries) {
    if (new Date(entry.at).getTime() > now.getTime()) break;
    current = entry.value;
  }
  return current;
}

function parseAndroidWidgetTimeline(value: string): AndroidWidgetTimeline {
  const parsed: unknown = JSON.parse(value);
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.today) ||
    !Array.isArray(parsed.nextReminder) ||
    parsed.today.length === 0 ||
    parsed.nextReminder.length === 0 ||
    parsed.today.length > maxTimelineEntries ||
    parsed.nextReminder.length > maxTimelineEntries
  ) {
    throw new Error("The Android widget timeline is invalid.");
  }

  return {
    nextReminder: parsed.nextReminder.map(parseNextReminderEntry),
    today: parsed.today.map(parseTodayEntry),
  };
}

function parseNextReminderEntry(
  value: unknown,
): AndroidWidgetTimeline["nextReminder"][number] {
  const entry = parseEntry(value);
  const reminder = entry.value;
  if (reminder === null) {
    return { at: entry.at, value: null };
  }
  if (
    !isRecord(reminder) ||
    typeof reminder.deepLink !== "string" ||
    !reminder.deepLink.startsWith("organa:///focus?taskId=") ||
    typeof reminder.time !== "string" ||
    typeof reminder.title !== "string"
  ) {
    throw new Error("The Android widget timeline is invalid.");
  }
  return {
    at: entry.at,
    value: {
      deepLink: reminder.deepLink,
      time: reminder.time,
      title: reminder.title,
    },
  };
}

function parseTodayEntry(
  value: unknown,
): AndroidWidgetTimeline["today"][number] {
  const entry = parseEntry(value);
  const today = entry.value;
  if (
    !isRecord(today) ||
    !Array.isArray(today.tasks) ||
    !today.tasks.every((task) => typeof task === "string") ||
    typeof today.remaining !== "number" ||
    !Number.isInteger(today.remaining) ||
    today.remaining < 0
  ) {
    throw new Error("The Android widget timeline is invalid.");
  }
  return {
    at: entry.at,
    value: {
      remaining: today.remaining,
      tasks: today.tasks,
    },
  };
}

function parseEntry(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.at !== "string" ||
    !Number.isFinite(new Date(value.at).getTime()) ||
    !("value" in value)
  ) {
    throw new Error("The Android widget timeline is invalid.");
  }
  return { at: value.at, value: value.value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
