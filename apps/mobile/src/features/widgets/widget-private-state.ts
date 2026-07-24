import type { WidgetTimeline } from "./widget-snapshot";

export function activateWidgetOwner(_ownerId: string) {
  return () => undefined;
}

export async function publishWidgetTimeline(
  _ownerId: string,
  _timeline: WidgetTimeline,
  _now = new Date(),
) {}

export async function clearWidgetPrivateState() {}
