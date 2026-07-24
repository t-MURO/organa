import { clearPrivatePlatformState } from "./clear-private-platform-state";
import { deleteOrganaDatabase } from "./organa-database.web";

export async function deleteLocalAccountData(namespace: string) {
  await clearPrivatePlatformState();
  await deleteOrganaDatabase(namespace);
}
