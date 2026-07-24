import { clearPendingTaskSnoozes } from "./create-task-snooze-scheduler.web";
import { clearShownReminderHistory } from "./in-app-reminder-history.web";
import {
  clearPendingWebPushSchedules,
  removeCurrentWebPushSubscription,
} from "./web-push-scheduler.web";

let activeOwnerId: string | undefined;
let operationChain: Promise<unknown> = Promise.resolve();

export function activateNotificationOwner(ownerId: string) {
  activeOwnerId = ownerId;
  return () => {
    if (activeOwnerId === ownerId) activeOwnerId = undefined;
  };
}

export function runNotificationOperation<T>(
  ownerId: string,
  action: () => Promise<T>,
) {
  return enqueue(async () => {
    if (activeOwnerId !== ownerId) return undefined;
    const result = await action();
    return activeOwnerId === ownerId ? result : undefined;
  });
}

export function clearNotificationPrivateState() {
  activeOwnerId = undefined;
  clearLocalNotificationState();
  return enqueue(async () => {
    clearLocalNotificationState();
    await removeCurrentWebPushSubscription();
    clearLocalNotificationState();
  });
}

function clearLocalNotificationState() {
  clearPendingWebPushSchedules();
  clearPendingTaskSnoozes();
  clearShownReminderHistory();
}

function enqueue<T>(action: () => Promise<T>) {
  const result = operationChain.then(action, action);
  operationChain = result.catch(() => undefined);
  return result;
}
