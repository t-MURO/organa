import { useEffect } from "react";

import { useAuth } from "../../auth/auth-context";
import { useTasks } from "../tasks/task-context";
import { buildWidgetTimeline } from "./widget-snapshot";
import {
  activateWidgetOwner,
  publishWidgetTimeline,
} from "./widget-private-state";

export function WidgetCoordinator() {
  const auth = useAuth();
  const { loading, tasks } = useTasks();
  const ownerId = auth.localPreview ? "local-preview" : auth.user?.id;

  useEffect(
    () => (ownerId ? activateWidgetOwner(ownerId) : undefined),
    [ownerId],
  );

  useEffect(() => {
    if (loading || !ownerId) return;
    const now = new Date();
    void publishWidgetTimeline(
      ownerId,
      buildWidgetTimeline(tasks, now),
      now,
    ).catch(() => undefined);
  }, [loading, ownerId, tasks]);

  return null;
}
