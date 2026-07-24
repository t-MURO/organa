import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import {
  loadAndroidWidgetTimeline,
  resolveAndroidWidgetSnapshot,
} from "./android-widget-snapshot.android";
import {
  renderNextReminderAndroidWidget,
  renderTodayTasksAndroidWidget,
} from "./android-widget-views.android";

export async function androidWidgetTaskHandler(
  props: WidgetTaskHandlerProps,
) {
  if (
    props.widgetAction === "WIDGET_DELETED" ||
    props.widgetAction === "WIDGET_CLICK"
  ) {
    return;
  }

  const timeline = await loadAndroidWidgetTimeline();
  const snapshot = resolveAndroidWidgetSnapshot(timeline);
  if (props.widgetInfo.widgetName === "TodayTasksWidget") {
    props.renderWidget(
      renderTodayTasksAndroidWidget(snapshot, props.widgetInfo),
    );
  } else if (props.widgetInfo.widgetName === "NextReminderWidget") {
    props.renderWidget(renderNextReminderAndroidWidget(snapshot));
  }
}
