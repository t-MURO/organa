import { useEffect } from "react";

import NextReminderWidget from "../../../widgets/NextReminderWidget";
import TodayTasksWidget from "../../../widgets/TodayTasksWidget";
import { useTasks } from "../tasks/task-context";
import { buildWidgetSnapshot } from "./widget-snapshot";

export function WidgetCoordinator() {
  const { loading, tasks } = useTasks();

  useEffect(() => {
    if (loading) return;
    const now = new Date();
    const snapshot = buildWidgetSnapshot(tasks, now);
    TodayTasksWidget.updateSnapshot({
      remaining: snapshot.today.remaining,
      tasks: snapshot.today.tasks,
    });

    const next = snapshot.nextReminder;
    NextReminderWidget.updateSnapshot({
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
    });
  }, [loading, tasks]);

  return null;
}
