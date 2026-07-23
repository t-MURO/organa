import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import {
  gentleReminderChannelId,
  resolveNativeNotificationResponse,
  type NativeNotificationData,
} from "../../data/native-notification-plan";

export function NotificationCoordinator() {
  const router = useRouter();

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse) {
      const action = resolveNativeNotificationResponse(
        response.actionIdentifier,
        (response.notification.request.content.data ??
          {}) as NativeNotificationData,
      );
      if (action.type === "check_in") router.push("/check-in");
      if (action.type === "open_task") {
        router.push({ pathname: "/focus", params: { taskId: action.taskId } });
      }
      if (action.type === "snooze") {
        void Notifications.scheduleNotificationAsync({
          content: action.content,
          trigger: {
            channelId: gentleReminderChannelId,
            seconds: action.seconds,
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          },
        });
      }
    }

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) {
      handle(initialResponse);
      Notifications.clearLastNotificationResponse();
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [router]);

  return null;
}
