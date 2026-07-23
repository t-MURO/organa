import { formatLocalDate, type Task } from "@organa/domain";
import { useEffect } from "react";

import NextReminderWidget from "../../../widgets/NextReminderWidget";
import TodayTasksWidget from "../../../widgets/TodayTasksWidget";
import { useTasks } from "../tasks/task-context";

export function WidgetCoordinator() {
  const { loading, tasks } = useTasks();

  useEffect(() => {
    if (loading) return;
    const now = new Date();
    const today = formatLocalDate(now);
    const todaysTasks = tasks.filter(
      (task) => task.plannedFor === today && !task.completedAt,
    );
    TodayTasksWidget.updateSnapshot({
      remaining: todaysTasks.length,
      tasks: todaysTasks.map((task) => task.title),
    });

    const next = tasks
      .filter((task) => !task.completedAt)
      .map((task) => ({ date: taskReminderDate(task), task }))
      .filter(
        (item): item is { date: Date; task: Task } =>
          Boolean(item.date && item.date >= now),
      )
      .sort((left, right) => left.date.getTime() - right.date.getTime())[0];
    NextReminderWidget.updateSnapshot({
      deepLink: next
        ? `organa:///focus?taskId=${encodeURIComponent(next.task.id)}`
        : "organa:///",
      time: next
        ? next.date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "--:--",
      title: next?.task.title ?? "No upcoming reminder",
    });
  }, [loading, tasks]);

  return null;
}

function taskReminderDate(task: Task) {
  if (task.dueAt) {
    const due = new Date(task.dueAt);
    if (!Number.isNaN(due.getTime())) return due;
  }
  if (!task.plannedFor || !task.scheduledTime) return undefined;
  const [year, month, day] = task.plannedFor.split("-").map(Number);
  const [hour, minute] = task.scheduledTime.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}
