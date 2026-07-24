import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
  TaskTemplate,
  UserSettings,
} from "@organa/domain";

import {
  assertDurableRecordWrites,
  type DurableRecordWriter,
} from "./durable-record-writer.types";
import { openOrganaDatabase } from "./organa-database.web";

export function createDurableRecordWriter(
  namespace = "local",
): DurableRecordWriter {
  return {
    async initialize() {
      await openOrganaDatabase(namespace);
    },
    async commit(writes) {
      assertDurableRecordWrites(namespace, writes);
      const database = await openOrganaDatabase(namespace);
      const transaction = database.transaction(
        [
          "tasks",
          "brainDumpBullets",
          "checkIns",
          "taskTemplates",
          "settings",
          "syncOutbox",
        ],
        "readwrite",
      );

      for (const write of writes) {
        const { local } = write;
        if (local.operation === "delete") {
          if (local.recordType === "task") {
            await transaction.objectStore("tasks").delete(local.recordId);
          }
          if (local.recordType === "template") {
            await transaction
              .objectStore("taskTemplates")
              .delete(local.recordId);
          }
          if (local.recordType === "brain_dump_bullet") {
            await transaction
              .objectStore("brainDumpBullets")
              .delete(local.recordId);
          }
          if (local.recordType === "check_in") {
            await transaction.objectStore("checkIns").delete(local.recordId);
          }
        } else {
          if (local.recordType === "task") {
            await transaction
              .objectStore("tasks")
              .put(local.value as Task);
          }
          if (local.recordType === "template") {
            await transaction
              .objectStore("taskTemplates")
              .put(local.value as TaskTemplate);
          }
          if (local.recordType === "brain_dump_bullet") {
            await transaction
              .objectStore("brainDumpBullets")
              .put(local.value as BrainDumpBullet);
          }
          if (local.recordType === "check_in") {
            const entry = local.value as CheckInEntry;
            const store = transaction.objectStore("checkIns");
            const previousId = await store.index("by-date").getKey(entry.date);
            if (previousId && previousId !== entry.id) {
              await store.delete(previousId);
            }
            await store.put(entry);
          }
          if (local.recordType === "settings") {
            await transaction
              .objectStore("settings")
              .put(local.value as UserSettings);
          }
        }
        if (write.mutation) {
          await transaction.objectStore("syncOutbox").put(write.mutation);
        }
      }
      await transaction.done;
    },
  };
}
