import * as Notifications from "expo-notifications";

import {
  clearAndroidWidgetTimeline,
  contentFreeAndroidWidgetSnapshot,
} from "../features/widgets/android-widget-snapshot.android";
import { updateAndroidWidgets } from "../features/widgets/android-widget-update.android";

export async function clearPrivatePlatformState() {
  await clearAndroidWidgetTimeline().catch(() => undefined);
  await Promise.allSettled([
    updateAndroidWidgets(contentFreeAndroidWidgetSnapshot()),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}
