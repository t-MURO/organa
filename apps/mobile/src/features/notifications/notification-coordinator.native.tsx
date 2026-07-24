import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import {
  gentleReminderChannelId,
  resolveNativeNotificationResponse,
  type NativeNotificationData,
} from "../../data/native-notification-plan";
import { useDevices } from "../account/device-context";
import { useTasks } from "../tasks/task-context";

export function NotificationCoordinator() {
  const router = useRouter();
  const devices = useDevices();
  const { loading: tasksLoading, tasks } = useTasks();

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse) {
      const action = resolveNativeNotificationResponse(
        response.actionIdentifier,
        (response.notification.request.content.data ??
          {}) as NativeNotificationData,
      );
      if (
        tasksLoading &&
        (action.type === "open_task" || action.type === "snooze")
      ) {
        return false;
      }
      if (action.type === "check_in") router.push("/check-in");
      if (action.type === "open_task") {
        router.push({ pathname: "/focus", params: { taskId: action.taskId } });
      }
      if (action.type === "snooze") {
        if (!devices.reminderAuthorizationReady) return false;
        if (!devices.remindersAllowed) return true;
        const taskId =
          typeof action.content.data.taskId === "string"
            ? action.content.data.taskId
            : undefined;
        const task = tasks.find((candidate) => candidate.id === taskId);
        const minutes = action.seconds / 60;
        if (
          !task ||
          task.completedAt ||
          !task.snoozePresets.includes(minutes)
        ) {
          return true;
        }
        const subtaskId =
          typeof action.content.data.subtaskId === "string"
            ? action.content.data.subtaskId
            : undefined;
        const subtask = subtaskId
          ? task.subtasks.find((candidate) => candidate.id === subtaskId)
          : undefined;
        if (subtaskId && (!subtask || subtask.completedAt)) return true;
        const content = {
          ...action.content,
          body: subtask?.title ?? task.title,
          data: {
            ...action.content.data,
            snoozePresets: task.snoozePresets,
            subtaskTitle: subtask?.title,
            taskTitle: task.title,
          },
          subtitle: subtask ? task.title : undefined,
        };
        void Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            channelId: gentleReminderChannelId,
            seconds: action.seconds,
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          },
        })
          .then(() => {
            if (!taskId) return;
            router.push({
              pathname: "/focus",
              params: {
                snoozed: String(action.seconds / 60),
                taskId,
              },
            });
          })
          .catch(() => {
            if (!taskId) return;
            router.push({
              pathname: "/focus",
              params: { snoozeError: "1", taskId },
            });
          });
      }
      return true;
    }

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse && handle(initialResponse)) {
      Notifications.clearLastNotificationResponse();
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
    router,
    tasks,
    tasksLoading,
  ]);

  return null;
}
