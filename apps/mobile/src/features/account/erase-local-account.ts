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

  // Platform cleanup needs the authenticated session and device proof; remove
  // account keys and device credentials only after that boundary has drained.
  const failed = [
    ...(await retryPhase([
      () => accountDeletionCache.remove(userId),
      () => deleteLocalAccountData(userId),
      removeReminderAuthorization,
    ])),
    ...(await retryPhase([signOut])),
    ...(await retryPhase([
      () => contentKeyVault.remove(userId),
      () => removeDeviceIdentity(),
    ])),
  ];

  if (failed.length > 0) {
    throw new Error(
      "Organa closed the account, but some local cleanup must be retried.",
    );
  }
}

async function retryPhase(operations: Array<() => Promise<unknown>>) {
  return failedOperations(await failedOperations(operations));
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
