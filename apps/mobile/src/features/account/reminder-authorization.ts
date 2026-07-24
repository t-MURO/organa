export interface ReminderAuthorizationInput {
  cacheLoaded: boolean;
  cachedAllowed: boolean | null;
  currentDevice?: {
    notificationsEnabled: boolean;
    primaryReminder: boolean;
    revokedAt: string | null;
  };
  localPreview: boolean;
  remoteResolved: boolean;
}

export interface ReminderAuthorization {
  allowed: boolean;
  ready: boolean;
}

export function resolveReminderAuthorization({
  cacheLoaded,
  cachedAllowed,
  currentDevice,
  localPreview,
  remoteResolved,
}: ReminderAuthorizationInput): ReminderAuthorization {
  if (localPreview) return { allowed: true, ready: true };

  if (currentDevice) {
    return {
      allowed:
        !currentDevice.revokedAt &&
        (currentDevice.primaryReminder ||
          currentDevice.notificationsEnabled),
      ready: true,
    };
  }

  if (remoteResolved) return { allowed: false, ready: true };
  if (cacheLoaded && cachedAllowed !== null) {
    return { allowed: cachedAllowed, ready: true };
  }
  return { allowed: false, ready: false };
}
