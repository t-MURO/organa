import {
  buildSubtaskReminderSchedule,
  buildTaskReminderSchedule,
  type Task,
  type UserSettings,
} from "@organa/domain";

export interface WebPushScheduleEntry {
  fireAt: string;
  key: string;
  repeatLocalTime?: string;
  route: string;
  timeZone?: string;
}

export interface WebPushSchedule {
  entries: WebPushScheduleEntry[];
  scope: string;
}

export function buildTaskWebPushSchedule(
  task: Task,
  now = new Date(),
): WebPushSchedule {
  const encodedTaskId = encodeOpaqueId(task.id);
  const route = `/focus?taskId=${encodedTaskId}`;
  const taskEntries = buildTaskReminderSchedule(task, now).map(
    ({ reminder, triggerAt }) => ({
      fireAt: triggerAt.toISOString(),
      key: `task:${encodeOpaqueId(reminder.id)}`,
      route,
    }),
  );
  const subtaskEntries = buildSubtaskReminderSchedule(task, now).map(
    ({ reminder, subtaskId, triggerAt }) => ({
      fireAt: triggerAt.toISOString(),
      key: `subtask:${encodeOpaqueId(subtaskId)}:${encodeOpaqueId(
        reminder.id,
      )}`,
      route,
    }),
  );

  return {
    entries: [...taskEntries, ...subtaskEntries],
    scope: taskWebPushScope(task.id),
  };
}

export function taskWebPushScope(taskId: string) {
  return `task:${encodeOpaqueId(taskId)}`;
}

export function buildCheckInWebPushSchedule(
  settings: UserSettings,
  now = new Date(),
  timeZone = resolvedTimeZone(),
): WebPushSchedule {
  const scope = "check-in";
  if (!settings.checkInReminder.enabled) {
    return { entries: [], scope };
  }

  const next = nextDailyLocalOccurrence(
    now,
    settings.checkInReminder.time,
    timeZone,
  );

  return {
    entries: [
      {
        fireAt: next.toISOString(),
        key: "check-in:daily",
        repeatLocalTime: settings.checkInReminder.time,
        route: "/check-in",
        timeZone,
      },
    ],
    scope,
  };
}

export function nextDailyLocalOccurrence(
  now: Date,
  localTime: string,
  timeZone: string,
) {
  const [hours, minutes] = localTime.split(":").map(Number);
  const today = zonedParts(now, timeZone);
  let candidate = localDateTimeToInstant(
    today.year,
    today.month,
    today.day,
    hours,
    minutes,
    timeZone,
  );
  if (candidate.getTime() > now.getTime()) return candidate;

  const tomorrow = new Date(
    Date.UTC(today.year, today.month - 1, today.day + 1),
  );
  return localDateTimeToInstant(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    hours,
    minutes,
    timeZone,
  );
}

function resolvedTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function encodeOpaqueId(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function localDateTimeToInstant(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day, hours, minutes);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(new Date(guess), timeZone);
    const renderedValue = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hours,
      rendered.minutes,
    );
    guess += target - renderedValue;
  }
  return new Date(guess);
}

function zonedParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    day: parts.day!,
    hours: parts.hour!,
    minutes: parts.minute!,
    month: parts.month!,
    year: parts.year!,
  };
}
