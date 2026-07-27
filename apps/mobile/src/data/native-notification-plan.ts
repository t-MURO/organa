import {
  buildSubtaskReminderSchedule,
  buildTaskReminderSchedule,
  type Task,
} from "@organa/domain";

export const gentleReminderChannelId = "gentle-reminders";

export interface NativeNotificationData {
  route?: string;
  snoozePresets?: number[];
  subtaskId?: string;
  subtaskTitle?: string;
  taskId?: string;
  taskTitle?: string;
  [key: string]: unknown;
}

export interface NativeNotificationContent {
  body: string;
  categoryIdentifier: string;
  data: NativeNotificationData;
  sound: false;
  subtitle?: string;
  title: string;
}

export interface NativeNotificationAction {
  buttonTitle: string;
  identifier: string;
  opensAppToForeground: boolean;
}

export interface NativeTaskNotificationPlan {
  category: {
    actions: NativeNotificationAction[];
    identifier: string;
  };
  requests: Array<{
    content: NativeNotificationContent;
    identifier: string;
    triggerAt: Date;
  }>;
}

export type NativeNotificationResponseAction =
  | { type: "check_in" }
  | { type: "device_approval" }
  | { type: "ignore" }
  | { taskId: string; type: "open_task" }
  | {
      content: NativeNotificationContent;
      seconds: number;
      type: "snooze";
    };

export function buildNativeTaskNotificationPlan(
  task: Task,
  now = new Date(),
): NativeTaskNotificationPlan {
  const categoryIdentifier = taskCategoryId(task.id);
  const data = taskNotificationData(task);
  const taskRequests = buildTaskReminderSchedule(task, now).map(
    ({ reminder, triggerAt }) => ({
      content: {
        body: task.title,
        categoryIdentifier,
        data,
        sound: false as const,
        subtitle: reminderSubtitle(reminder.stage),
        title: reminderTitle(reminder.stage),
      },
      identifier: taskNotificationId(task.id, reminder.id),
      triggerAt,
    }),
  );
  const subtaskRequests = buildSubtaskReminderSchedule(task, now).map(
    ({ reminder, subtaskId, subtaskTitle, triggerAt }) => ({
      content: {
        body: subtaskTitle,
        categoryIdentifier,
        data: {
          ...data,
          subtaskId,
          subtaskTitle,
        },
        sound: false as const,
        subtitle: task.title,
        title: "A next step is ready",
      },
      identifier: taskNotificationId(
        task.id,
        `${reminder.id}:subtask:${subtaskId}`,
      ),
      triggerAt,
    }),
  );

  return {
    category: {
      actions: [
        {
          buttonTitle: "Focus",
          identifier: "focus",
          opensAppToForeground: true,
        },
        ...task.snoozePresets.slice(0, 2).map((minutes) => ({
          buttonTitle: `Snooze ${minutes}m`,
          identifier: `snooze-${minutes}`,
          // Expo cannot deliver a response to a killed app without foregrounding.
          opensAppToForeground: true,
        })),
      ],
      identifier: categoryIdentifier,
    },
    requests: [...taskRequests, ...subtaskRequests],
  };
}

export function createNativeTaskSnoozeContent(
  task: Task,
): NativeNotificationContent {
  return {
    body: task.title,
    categoryIdentifier: taskCategoryId(task.id),
    data: taskNotificationData(task),
    sound: false,
    title: "A snoozed task is ready",
  };
}

export function resolveNativeNotificationResponse(
  actionIdentifier: string,
  data: NativeNotificationData,
): NativeNotificationResponseAction {
  if (data.route === "/check-in") {
    return { type: "check_in" };
  }
  if (data.route === "/account" && data.type === "device_approval") {
    return { type: "device_approval" };
  }

  const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
  if (!taskId) return { type: "ignore" };

  const snoozeMatch = /^snooze-(\d+)$/.exec(actionIdentifier);
  if (snoozeMatch) {
    const minutes = Number(snoozeMatch[1]);
    const presets = Array.isArray(data.snoozePresets)
      ? data.snoozePresets.filter(
          (value): value is number =>
            Number.isSafeInteger(value) && value > 0,
        )
      : [];
    if (
      !Number.isSafeInteger(minutes) ||
      minutes <= 0 ||
      !presets.includes(minutes)
    ) {
      return { type: "ignore" };
    }

    return {
      content: {
        body:
          typeof data.subtaskTitle === "string"
            ? data.subtaskTitle
            : typeof data.taskTitle === "string"
              ? data.taskTitle
              : "Your task is ready when you are.",
        categoryIdentifier: taskCategoryId(taskId),
        data,
        sound: false,
        subtitle:
          typeof data.subtaskTitle === "string" &&
          typeof data.taskTitle === "string"
            ? data.taskTitle
            : undefined,
        title: "A gentle reminder",
      },
      seconds: minutes * 60,
      type: "snooze",
    };
  }

  return { taskId, type: "open_task" };
}

function taskNotificationData(task: Task): NativeNotificationData {
  return {
    snoozePresets: task.snoozePresets,
    taskId: task.id,
    taskTitle: task.title,
  };
}

function taskCategoryId(taskId: string) {
  return `organa-${taskId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function taskNotificationId(taskId: string, reminderId: string) {
  return `organa:${taskId}:${reminderId}`;
}

function reminderTitle(stage: Task["reminders"][number]["stage"]) {
  if (stage === "before_due") return "Coming up gently";
  if (stage === "after_due") return "A gentle follow-up";
  return "Ready when you are";
}

function reminderSubtitle(stage: Task["reminders"][number]["stage"]) {
  if (stage === "before_due") return "Before its due time";
  if (stage === "after_due") return "After its due time";
  return "Due now";
}
