import * as Notifications from "expo-notifications";

import {
  clearAndroidWidgetTimeline,
  contentFreeAndroidWidgetSnapshot,
} from "../features/widgets/android-widget-snapshot.android";
import { updateAndroidWidgets } from "../features/widgets/android-widget-update.android";
import { clearWidgetPrivateState } from "../features/widgets/widget-private-state";
import { clearNotificationPrivateState } from "./notification-private-state";

export async function clearPrivatePlatformState() {
  await Promise.allSettled([
    clearWidgetPrivateState().catch(() =>
      Promise.allSettled([
        clearAndroidWidgetTimeline(),
        updateAndroidWidgets(contentFreeAndroidWidgetSnapshot()),
      ]),
    ),
    clearNotificationPrivateState().catch(() =>
      Promise.allSettled([
        Promise.resolve().then(() =>
          Notifications.clearLastNotificationResponse(),
        ),
        Notifications.cancelAllScheduledNotificationsAsync(),
        Notifications.dismissAllNotificationsAsync(),
      ]),
    ),
  ]);
}
