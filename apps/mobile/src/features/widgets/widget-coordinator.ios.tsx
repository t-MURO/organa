import { useEffect } from "react";

import NextReminderWidget from "../../../widgets/NextReminderWidget";
import TodayTasksWidget from "../../../widgets/TodayTasksWidget";
import { useTasks } from "../tasks/task-context";
import { buildWidgetTimeline } from "./widget-snapshot";

export function WidgetCoordinator() {
  const { loading, tasks } = useTasks();

  useEffect(() => {
    if (loading) return;
    const now = new Date();
    const timeline = buildWidgetTimeline(tasks, now);
    TodayTasksWidget.updateTimeline(
      timeline.today.map((entry) => ({
        date: entry.date,
        props: {
          remaining: entry.value.remaining,
          tasks: entry.value.tasks,
        },
      })),
    );
    NextReminderWidget.updateTimeline(
      timeline.nextReminder.map((entry) => ({
        date: entry.date,
        props: nextReminderProps(entry.value),
      })),
    );
  }, [loading, tasks]);

  return null;
}

function nextReminderProps(
  next: ReturnType<typeof buildWidgetTimeline>["nextReminder"][number]["value"],
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
