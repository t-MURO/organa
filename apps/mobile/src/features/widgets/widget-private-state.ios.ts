import NextReminderWidget from "../../../widgets/NextReminderWidget";
import TodayTasksWidget from "../../../widgets/TodayTasksWidget";
import type { WidgetTimeline } from "./widget-snapshot";

let activeOwnerId: string | undefined;
let operationChain: Promise<unknown> = Promise.resolve();

export function activateWidgetOwner(ownerId: string) {
  activeOwnerId = ownerId;
  return () => {
    if (activeOwnerId === ownerId) activeOwnerId = undefined;
  };
}

export function publishWidgetTimeline(
  ownerId: string,
  timeline: WidgetTimeline,
) {
  return enqueue(async () => {
    if (activeOwnerId !== ownerId) return;
    const results = await Promise.allSettled([
      Promise.resolve().then(() =>
        TodayTasksWidget.updateTimeline(
          timeline.today.map((entry) => ({
            date: entry.date,
            props: {
              remaining: entry.value.remaining,
              tasks: entry.value.tasks,
            },
          })),
        ),
      ),
      Promise.resolve().then(() =>
        NextReminderWidget.updateTimeline(
          timeline.nextReminder.map((entry) => ({
            date: entry.date,
            props: nextReminderProps(entry.value),
          })),
        ),
      ),
    ]);
    throwFirstRejected(results);
  });
}

export function clearWidgetPrivateState() {
  activeOwnerId = undefined;
  return enqueue(async () => {
    const now = new Date();
    const results = await Promise.allSettled([
      Promise.resolve().then(() =>
        TodayTasksWidget.updateTimeline([
          {
            date: now,
            props: { remaining: 0, tasks: [] },
          },
        ]),
      ),
      Promise.resolve().then(() =>
        NextReminderWidget.updateTimeline([
          {
            date: now,
            props: {
              deepLink: "organa:///",
              time: "--:--",
              title: "No upcoming reminder",
            },
          },
        ]),
      ),
    ]);
    throwFirstRejected(results);
  });
}

function nextReminderProps(
  next: WidgetTimeline["nextReminder"][number]["value"],
) {
  return {
    deepLink: next
      ? `organa:///focus?taskId=${encodeURIComponent(next.taskId)}`
      : "organa:///",
    time: next
      ? next.time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--",
    title: next?.title ?? "No upcoming reminder",
  };
}

function enqueue(action: () => Promise<void>) {
  const result = operationChain.then(action, action);
  operationChain = result.catch(() => undefined);
  return result;
}

function throwFirstRejected(results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}
