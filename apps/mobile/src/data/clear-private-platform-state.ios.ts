import * as Notifications from "expo-notifications";

import NextReminderWidget from "../../widgets/NextReminderWidget";
import TodayTasksWidget from "../../widgets/TodayTasksWidget";

export async function clearPrivatePlatformState() {
  const now = new Date();
  await Promise.allSettled([
    Promise.resolve().then(() =>
      TodayTasksWidget.updateTimeline([
        {
          date: now,
          props: { remaining: 0, tasks: [] },
        },
      ]),
    ),
    Promise.resolve().then(() =>
      NextReminderWidget.updateTimeline([
        {
          date: now,
          props: {
            deepLink: "organa:///",
            time: "--:--",
            title: "No upcoming reminder",
          },
        },
      ]),
    ),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
}
