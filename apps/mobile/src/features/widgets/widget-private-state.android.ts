import {
  clearAndroidWidgetTimeline,
  contentFreeAndroidWidgetSnapshot,
  resolveAndroidWidgetSnapshot,
  saveAndroidWidgetTimeline,
  toAndroidWidgetTimeline,
} from "./android-widget-snapshot.android";
import { updateAndroidWidgets } from "./android-widget-update.android";
import type { WidgetTimeline } from "./widget-snapshot";

let activeOwnerId: string | undefined;
let operationChain: Promise<unknown> = Promise.resolve();

export function activateWidgetOwner(ownerId: string) {
  activeOwnerId = ownerId;
  return () => {
    if (activeOwnerId === ownerId) activeOwnerId = undefined;
  };
}

export function publishWidgetTimeline(
  ownerId: string,
  timeline: WidgetTimeline,
  now = new Date(),
) {
  return enqueue(async () => {
    if (activeOwnerId !== ownerId) return;
    const storedTimeline = toAndroidWidgetTimeline(timeline);
    const snapshot = resolveAndroidWidgetSnapshot(storedTimeline, now);
    await saveAndroidWidgetTimeline(storedTimeline);
    if (activeOwnerId !== ownerId) return;
    await updateAndroidWidgets(snapshot);
  });
}

export function clearWidgetPrivateState() {
  activeOwnerId = undefined;
  return enqueue(async () => {
    const results = await Promise.allSettled([
      clearAndroidWidgetTimeline(),
      updateAndroidWidgets(contentFreeAndroidWidgetSnapshot()),
    ]);
    throwFirstRejected(results);
  });
}

function enqueue(action: () => Promise<void>) {
  const result = operationChain.then(action, action);
  operationChain = result.catch(() => undefined);
  return result;
}

function throwFirstRejected(results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected",
  );
  if (rejected) throw rejected.reason;
}
