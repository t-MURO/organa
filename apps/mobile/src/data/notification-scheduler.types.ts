import type { Task } from "@organa/domain";

export interface NotificationCapability {
  supported: boolean;
  label: string;
  reason?: string;
}

export interface NotificationSyncResult {
  scheduled: number;
  permission: "not_requested" | "granted" | "denied" | "unsupported";
}

export interface NotificationScheduler {
  capability: NotificationCapability;
  initialize(): Promise<void>;
  syncTask(
    task: Task,
    requestPermission?: boolean,
  ): Promise<NotificationSyncResult>;
  cancelTask(taskId: string): Promise<void>;
}
