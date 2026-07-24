import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
  TaskTemplate,
  UserSettings,
} from "@organa/domain";

import { createBrainDumpRepository } from "./create-brain-dump-repository";
import { createCheckInRepository } from "./create-check-in-repository";
import { createSettingsRepository } from "./create-settings-repository";
import { createSyncOutboxRepository } from "./create-sync-outbox-repository";
import { createTaskRepository } from "./create-task-repository";
import { createTemplateRepository } from "./create-template-repository";
import {
  assertDurableRecordWrites,
  type DurableRecordWriter,
} from "./durable-record-writer.types";

export function createDurableRecordWriter(
  namespace = "local",
): DurableRecordWriter {
  const brainDump = createBrainDumpRepository(namespace);
  const checkIns = createCheckInRepository(namespace);
  const settings = createSettingsRepository(namespace);
  const outbox = createSyncOutboxRepository(namespace);
  const tasks = createTaskRepository(namespace);
  const templates = createTemplateRepository(namespace);

  return {
    async initialize() {
      await Promise.all([
        brainDump.initialize(),
        checkIns.initialize(),
        settings.initialize(),
        outbox.initialize(),
        tasks.initialize(),
        templates.initialize(),
      ]);
    },
    async commit(writes) {
      assertDurableRecordWrites(namespace, writes);
      for (const write of writes) {
        const { local } = write;
        if (local.operation === "delete") {
          if (local.recordType === "task") await tasks.remove(local.recordId);
          if (local.recordType === "template") {
            await templates.remove(local.recordId);
          }
          if (local.recordType === "brain_dump_bullet") {
            await brainDump.remove(local.recordId);
          }
          if (local.recordType === "check_in") {
            await checkIns.remove(local.recordId);
          }
        } else {
          if (local.recordType === "task") {
            await tasks.upsert(local.value as Task);
          }
          if (local.recordType === "template") {
            await templates.upsert(local.value as TaskTemplate);
          }
          if (local.recordType === "brain_dump_bullet") {
            await brainDump.upsert(local.value as BrainDumpBullet);
          }
          if (local.recordType === "check_in") {
            await checkIns.upsert(local.value as CheckInEntry);
          }
          if (local.recordType === "settings") {
            await settings.upsert(local.value as UserSettings);
          }
        }
        if (write.mutation) await outbox.upsert(write.mutation);
      }
    },
  };
}
