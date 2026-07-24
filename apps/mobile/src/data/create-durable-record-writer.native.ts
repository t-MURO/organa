import type {
  BrainDumpBullet,
  CheckInEntry,
  Task,
  TaskTemplate,
  UserSettings,
} from "@organa/domain";
import * as SQLite from "expo-sqlite";

import {
  assertDurableRecordWrites,
  type DurableRecordWriter,
  type LocalRecordType,
} from "./durable-record-writer.types";

export function createDurableRecordWriter(
  namespace = "local",
): DurableRecordWriter {
  const databasePromise = SQLite.openDatabaseAsync(databaseName(namespace));
  const initialization = databasePromise.then((database) =>
    database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS brain_dump_bullets (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        rank REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS check_ins (
        id TEXT PRIMARY KEY NOT NULL,
        entry_date TEXT UNIQUE NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_templates (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_settings (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `),
  );

  return {
    async initialize() {
      await initialization;
    },
    async commit(writes) {
      assertDurableRecordWrites(namespace, writes);
      await initialization;
      const database = await databasePromise;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const write of writes) {
          const { local } = write;
          if (local.operation === "delete") {
            await deleteLocalRecord(
              transaction,
              local.recordType,
              local.recordId,
            );
          } else {
            await upsertLocalRecord(
              transaction,
              local.recordType,
              local.value,
            );
          }
          if (write.mutation) {
            await transaction.runAsync(
              `INSERT INTO sync_outbox (id, payload, created_at)
               VALUES (?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
              write.mutation.id,
              JSON.stringify(write.mutation),
              write.mutation.createdAt,
            );
          }
        }
      });
    },
  };
}

async function deleteLocalRecord(
  transaction: SQLite.SQLiteDatabase,
  recordType: LocalRecordType,
  recordId: string,
) {
  if (recordType === "task") {
    await transaction.runAsync("DELETE FROM tasks WHERE id = ?", recordId);
  }
  if (recordType === "template") {
    await transaction.runAsync(
      "DELETE FROM task_templates WHERE id = ?",
      recordId,
    );
  }
  if (recordType === "brain_dump_bullet") {
    await transaction.runAsync(
      "DELETE FROM brain_dump_bullets WHERE id = ?",
      recordId,
    );
  }
  if (recordType === "check_in") {
    await transaction.runAsync(
      "DELETE FROM check_ins WHERE id = ?",
      recordId,
    );
  }
}

async function upsertLocalRecord(
  transaction: SQLite.SQLiteDatabase,
  recordType:
    | "task"
    | "brain_dump_bullet"
    | "check_in"
    | "template"
    | "settings",
  value: unknown,
) {
  if (recordType === "task") {
    const task = value as Task;
    await transaction.runAsync(
      `INSERT INTO tasks (id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      task.id,
      JSON.stringify(task),
      task.updatedAt,
    );
  }
  if (recordType === "template") {
    const template = value as TaskTemplate;
    await transaction.runAsync(
      `INSERT INTO task_templates (id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      template.id,
      JSON.stringify(template),
      template.updatedAt,
    );
  }
  if (recordType === "brain_dump_bullet") {
    const bullet = value as BrainDumpBullet;
    await transaction.runAsync(
      `INSERT INTO brain_dump_bullets (id, payload, rank, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         rank = excluded.rank,
         updated_at = excluded.updated_at`,
      bullet.id,
      JSON.stringify(bullet),
      bullet.rank,
      bullet.updatedAt,
    );
  }
  if (recordType === "check_in") {
    const entry = value as CheckInEntry;
    await transaction.runAsync(
      "DELETE FROM check_ins WHERE entry_date = ? AND id <> ?",
      entry.date,
      entry.id,
    );
    await transaction.runAsync(
      `INSERT INTO check_ins (id, entry_date, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         entry_date = excluded.entry_date,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      entry.id,
      entry.date,
      JSON.stringify(entry),
      entry.updatedAt,
    );
  }
  if (recordType === "settings") {
    const settings = value as UserSettings;
    await transaction.runAsync(
      `INSERT INTO user_settings (id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      settings.id,
      JSON.stringify(settings),
      settings.updatedAt,
    );
  }
}

function databaseName(namespace: string) {
  return `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
}
