import { deleteLocalAccountData } from "../../data/delete-local-account-data";
import { contentKeyVault } from "../../security/content-key-vault";
import { removeDeviceIdentity } from "../../security/device-identity";
import { accountDeletionCache } from "./account-deletion-cache";

export async function eraseLocalAccount(
  userId: string,
  isActiveOwner: () => Promise<boolean>,
  signOut: () => Promise<void>,
  removeReminderAuthorization: () => Promise<void>,
) {
  if (!(await isActiveOwner())) return;

  const operations = [
    () => accountDeletionCache.remove(userId),
    () => contentKeyVault.remove(userId),
    () => deleteLocalAccountData(userId),
    removeReminderAuthorization,
    () => removeDeviceIdentity(),
    signOut,
  ];
  const failed = await failedOperations(operations);
  const stillFailed = await failedOperations(failed);

  if (stillFailed.length > 0) {
    throw new Error(
      "Organa closed the account, but some local cleanup must be retried.",
    );
  }
}

async function failedOperations(
  operations: Array<() => Promise<unknown>>,
) {
  const results = await Promise.allSettled(
    operations.map((operation) => operation()),
  );
  return operations.filter(
    (_, index) => results[index]?.status === "rejected",
  );
}
