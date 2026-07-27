import * as SQLite from "expo-sqlite";

const databasePromises = new Map<
  string,
  Promise<SQLite.SQLiteDatabase>
>();

export function openOrganaDatabase(namespace: string) {
  const name = databaseName(namespace);
  const existing = databasePromises.get(name);
  if (existing) return existing;

  const opening = SQLite.openDatabaseAsync(databaseName(namespace))
    .then(async (database) => {
      await database.execAsync(`
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
      `);
      return database;
    })
    .catch((error) => {
      if (databasePromises.get(name) === opening) {
        databasePromises.delete(name);
      }
      throw error;
    });

  databasePromises.set(name, opening);
  return opening;
}

export async function deleteOrganaDatabase(namespace: string) {
  const name = databaseName(namespace);
  const existing = databasePromises.get(name);
  databasePromises.delete(name);

  const database = existing
    ? await existing.catch(() => SQLite.openDatabaseAsync(name))
    : await SQLite.openDatabaseAsync(name);
  await database.execAsync(`
    PRAGMA secure_delete = ON;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS brain_dump_bullets;
    DROP TABLE IF EXISTS check_ins;
    DROP TABLE IF EXISTS task_templates;
    DROP TABLE IF EXISTS sync_outbox;
    DROP TABLE IF EXISTS user_settings;
    VACUUM;
  `);
  await database.closeAsync().catch(() => undefined);
  await SQLite.deleteDatabaseAsync(name).catch(() => undefined);
}

function databaseName(namespace: string) {
  return `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
}
