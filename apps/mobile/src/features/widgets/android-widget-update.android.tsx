import { requestWidgetUpdate } from "react-native-android-widget";

import type { AndroidWidgetSnapshot } from "./android-widget-snapshot.android";
import {
  renderNextReminderAndroidWidget,
  renderTodayTasksAndroidWidget,
} from "./android-widget-views.android";

export async function updateAndroidWidgets(
  snapshot: AndroidWidgetSnapshot,
) {
  await Promise.allSettled([
    requestWidgetUpdate({
      renderWidget: (info) =>
        renderTodayTasksAndroidWidget(snapshot, info),
      widgetName: "TodayTasksWidget",
    }),
    requestWidgetUpdate({
      renderWidget: () => renderNextReminderAndroidWidget(snapshot),
      widgetName: "NextReminderWidget",
    }),
  ]);
}
