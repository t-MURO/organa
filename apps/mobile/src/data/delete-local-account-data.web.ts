import { deleteOrganaDatabase } from "./organa-database.web";

export async function deleteLocalAccountData(namespace: string) {
  await deleteOrganaDatabase(namespace);
}
