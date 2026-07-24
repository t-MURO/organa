export function activateNotificationOwner(_ownerId: string) {
  return () => undefined;
}

export function runNotificationOperation<T>(
  _ownerId: string,
  action: () => Promise<T>,
) {
  return action().then((value) => value as T | undefined);
}

export async function clearNotificationPrivateState() {}
