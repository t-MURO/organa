import { useEffect } from "react";

import { useTasks } from "../tasks/task-context";
import {
  resolveAndroidWidgetSnapshot,
  saveAndroidWidgetTimeline,
  toAndroidWidgetTimeline,
} from "./android-widget-snapshot.android";
import { updateAndroidWidgets } from "./android-widget-update.android";
import { buildWidgetTimeline } from "./widget-snapshot";

export function WidgetCoordinator() {
  const { loading, tasks } = useTasks();

  useEffect(() => {
    if (loading) return;
    const now = new Date();
    const timeline = toAndroidWidgetTimeline(buildWidgetTimeline(tasks, now));
    const snapshot = resolveAndroidWidgetSnapshot(timeline, now);
    void saveAndroidWidgetTimeline(timeline)
      .catch(() => undefined)
      .then(() => updateAndroidWidgets(snapshot));
  }, [loading, tasks]);

  return null;
}
