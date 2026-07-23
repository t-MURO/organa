import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

export function NotificationCoordinator() {
  const router = useRouter();

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data ?? {};
      if (data.route === "/check-in") {
        router.push("/check-in");
        return;
      }
      const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
      if (!taskId) return;

      if (response.actionIdentifier.startsWith("snooze-")) {
        const minutes = Number(
          response.actionIdentifier.replace("snooze-", ""),
        );
        if (Number.isInteger(minutes) && minutes > 0) {
          void Notifications.scheduleNotificationAsync({
            content: {
              body:
                typeof data.taskTitle === "string"
                  ? data.taskTitle
                  : "Your task is ready when you are.",
              data,
              sound: false,
              title: "A gentle reminder",
            },
            trigger: {
              channelId: "gentle-reminders",
              seconds: minutes * 60,
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            },
          });
        }
        return;
      }

      router.push({ pathname: "/focus", params: { taskId } });
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
