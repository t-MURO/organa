import * as SQLite from "expo-sqlite";

export async function deleteLocalAccountData(namespace: string) {
  const name = `organa-${namespace.replace(/[^a-zA-Z0-9_-]/g, "-")}.db`;
  await SQLite.deleteDatabaseAsync(name).catch(() => undefined);
}
