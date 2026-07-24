import { supabase } from "../auth/supabase";
import { getDeviceIdentity } from "../security/device-identity";
import type {
  WebPushSchedule,
  WebPushScheduleEntry,
} from "./web-push-plan";

export type WebPushPermission =
  | "denied"
  | "granted"
  | "not_requested"
  | "unsupported";

interface StoredSchedules {
  [scope: string]: WebPushScheduleEntry[];
}

const storagePrefix = "organa.web-push-schedules.";
const vapidPublicKey =
  process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
let initialized = false;
let flushChain: Promise<unknown> = Promise.resolve();

export const webPushConfigured = /^B[A-Za-z0-9_-]{86}$/.test(
  vapidPublicKey,
);

export function initializeWebPushScheduler() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => {
    void flushPendingSchedules(false);
  });
}

export async function syncWebPushSchedule(
  schedule: WebPushSchedule,
  requestPermission = false,
): Promise<WebPushPermission> {
  if (requestPermission && schedule.entries.length > 0) {
    await ensureSubscription(true).catch(() => undefined);
  }
  const context = await currentContext();
  if (!context) return "unsupported";

  const schedules = readSchedules(context.storageKey);
  schedules[schedule.scope] = schedule.entries;
  writeSchedules(context.storageKey, schedules);
  return flushPendingSchedules(false);
}

export async function flushPendingSchedules(
  requestPermission: boolean,
): Promise<WebPushPermission> {
  return enqueueFlush(() =>
    flushPendingSchedulesOnce(requestPermission),
  );
}

export function clearPendingWebPushSchedules() {
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(storagePrefix)) {
      localStorage.removeItem(key);
    }
  }
}

export function removeCurrentWebPushSubscription() {
  return enqueueFlush(removeCurrentWebPushSubscriptionOnce);
}

async function removeCurrentWebPushSubscriptionOnce() {
  const context = await currentContext();
  if (!context || !supabase) return;
  const result = await supabase.rpc("remove_current_web_push_subscription", {
    p_current_device_id: context.device.id,
    p_current_device_proof: context.device.secret,
  });
  if (result.error) throw result.error;
}

function enqueueFlush<T>(action: () => Promise<T>) {
  const current = flushChain.then(action, action);
  flushChain = current.catch(() => undefined);
  return current;
}

async function flushPendingSchedulesOnce(
  requestPermission: boolean,
): Promise<WebPushPermission> {
  const context = await currentContext();
  if (!context || !supabase) return "unsupported";
  const schedules = readSchedules(context.storageKey);
  const pending = Object.entries(schedules);
  if (pending.length === 0) return currentPermission();

  const hasDeliveries = pending.some(([, entries]) => entries.length > 0);
  const subscription = await (
    hasDeliveries
      ? ensureSubscription(requestPermission)
      : existingSubscription()
  ).catch(() => undefined);
  const permission = currentPermission();
  const serializedSubscription = subscription
    ? serializeSubscription(subscription)
    : null;

  for (const [scope, entries] of pending) {
    if (entries.length > 0 && !serializedSubscription) continue;
    const result = await supabase.rpc("replace_web_push_schedule", {
      p_current_device_id: context.device.id,
      p_current_device_proof: context.device.secret,
      p_entries: entries,
      p_scope: scope,
      p_subscription: serializedSubscription,
    });
    if (result.error) continue;
    const latestSchedules = readSchedules(context.storageKey);
    if (scheduleEntriesEqual(latestSchedules[scope], entries)) {
      delete latestSchedules[scope];
      writeSchedules(context.storageKey, latestSchedules);
    }
  }

  return permission;
}

async function currentContext() {
  if (!supabase) return undefined;
  const sessionResult = await supabase.auth.getSession();
  const userId = sessionResult.data.session?.user.id;
  if (!userId) return undefined;
  const device = await getDeviceIdentity();
  return {
    device,
    storageKey: `${storagePrefix}${userId}.${device.id}`,
  };
}

async function ensureSubscription(requestPermission: boolean) {
  if (!supportsWebPush()) return undefined;
  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return undefined;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    applicationServerKey: decodeVapidPublicKey(vapidPublicKey),
    userVisibleOnly: true,
  });
}

async function existingSubscription() {
  if (!supportsWebPush()) return undefined;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function supportsWebPush() {
  return Boolean(
    webPushConfigured &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
  );
}

function currentPermission(): WebPushPermission {
  if (!supportsWebPush()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "not_requested";
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    auth: json.keys?.auth,
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    p256dh: json.keys?.p256dh,
  };
}

function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return bytes;
}

function readSchedules(key: string): StoredSchedules {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([scope, entries]) =>
          validScope(scope) &&
          Array.isArray(entries) &&
          entries.every(isScheduleEntry),
      ),
    );
  } catch {
    return {};
  }
}

export function scheduleEntriesEqual(
  left: WebPushScheduleEntry[] | undefined,
  right: WebPushScheduleEntry[],
) {
  return (
    left?.length === right.length &&
    right.every((entry, index) => {
      const candidate = left[index];
      return (
        candidate?.fireAt === entry.fireAt &&
        candidate.key === entry.key &&
        candidate.repeatLocalTime === entry.repeatLocalTime &&
        candidate.route === entry.route &&
        candidate.timeZone === entry.timeZone
      );
    })
  );
}

function validScope(value: string) {
  return /^(check-in|task:[A-Za-z0-9%._~-]+)$/.test(value);
}

function isScheduleEntry(value: unknown): value is WebPushScheduleEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.fireAt === "string" &&
    typeof entry.key === "string" &&
    typeof entry.route === "string" &&
    (entry.repeatLocalTime === undefined ||
      typeof entry.repeatLocalTime === "string") &&
    (entry.timeZone === undefined || typeof entry.timeZone === "string")
  );
}

function writeSchedules(key: string, schedules: StoredSchedules) {
  if (typeof localStorage === "undefined") return;
  if (Object.keys(schedules).length === 0) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, JSON.stringify(schedules));
  }
}
