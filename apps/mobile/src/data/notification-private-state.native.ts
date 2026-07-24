import * as Notifications from "expo-notifications";

let activeOwnerId: string | undefined;
let operationChain: Promise<unknown> = Promise.resolve();

export function activateNotificationOwner(ownerId: string) {
  ensureOwner(ownerId);
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
  return enqueue(clearAllNotifications);
}

function ensureOwner(ownerId: string) {
  if (activeOwnerId === ownerId) return;
  activeOwnerId = ownerId;
  void enqueue(async () => {
    if (activeOwnerId === ownerId) await clearAllNotifications();
  }).catch(() => undefined);
}

function enqueue<T>(action: () => Promise<T>) {
  const result = operationChain.then(action, action);
  operationChain = result.catch(() => undefined);
  return result;
}

async function clearAllNotifications() {
  const results = await Promise.allSettled([
    Promise.resolve().then(() =>
      Notifications.clearLastNotificationResponse(),
    ),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.dismissAllNotificationsAsync(),
  ]);
  const rejected = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}
