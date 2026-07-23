import * as SQLite from "expo-sqlite";

export async function deleteLocalAccountData(namespace: string) {
  const name = `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
  const database = await SQLite.openDatabaseAsync(name);
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
