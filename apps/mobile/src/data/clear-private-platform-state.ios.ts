import * as Notifications from "expo-notifications";

import NextReminderWidget from "../../widgets/NextReminderWidget";
import TodayTasksWidget from "../../widgets/TodayTasksWidget";

export async function clearPrivatePlatformState() {
  const now = new Date();
  TodayTasksWidget.updateTimeline([
    {
      date: now,
      props: { remaining: 0, tasks: [] },
    },
  ]);
  NextReminderWidget.updateTimeline([
    {
      date: now,
      props: {
        deepLink: "organa:///",
        time: "--:--",
        title: "No upcoming reminder",
      },
    },
  ]);

  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}
