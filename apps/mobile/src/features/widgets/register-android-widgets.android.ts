import { registerWidgetTaskHandler } from "react-native-android-widget";

import { androidWidgetTaskHandler } from "./android-widget-task-handler.android";

export function registerAndroidWidgets() {
  registerWidgetTaskHandler(androidWidgetTaskHandler);
}
