const LIST_PAGE_SIZE = 1_000;
const MAX_LIST_PAGES = 1_000;
const UNCERTAIN_RECONCILIATION_ATTEMPTS = 5;
const UNCERTAIN_RECONCILIATION_DELAY_MS = 5_000;

export function createSyntheticAccountTracker({ emailPrefix }) {
  if (
    typeof emailPrefix !== "string" ||
    !/^[a-z0-9-]+-$/.test(emailPrefix)
  ) {
    throw new Error("Synthetic account emailPrefix is invalid.");
  }

  const attemptedEmails = new Set();
  const knownUserIds = new Set();
  const uncertainEmails = new Set();

  return {
    async cleanup(admin) {
      if (attemptedEmails.size === 0) return;

      await deleteUserIds(admin, knownUserIds);

      const attempts =
        uncertainEmails.size > 0
          ? UNCERTAIN_RECONCILIATION_ATTEMPTS
          : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) {
          await wait(UNCERTAIN_RECONCILIATION_DELAY_MS);
        }
        const matchingUserIds = await listMatchingUserIds(
          admin,
          attemptedEmails,
        );
        await deleteUserIds(admin, matchingUserIds);
      }

      const remainingUserIds = await listMatchingUserIds(
        admin,
        attemptedEmails,
      );
      if (remainingUserIds.size > 0) {
        throw new Error(
          "One or more tracked synthetic accounts remain after cleanup.",
        );
      }
    },

    recordAttempt(email) {
      const normalizedEmail = normalizeTrackedEmail(email, emailPrefix);
      attemptedEmails.add(normalizedEmail);
      uncertainEmails.add(normalizedEmail);
    },

    recordCreationResult(email, result) {
      const normalizedEmail = normalizeTrackedEmail(email, emailPrefix);
      if (!attemptedEmails.has(normalizedEmail)) {
        throw new Error(
          "Synthetic account creation result was not preceded by an attempt.",
        );
      }

      const user = result?.data?.user;
      if (!user) return;
      if (
        typeof user.id !== "string" ||
        user.email?.toLowerCase() !== normalizedEmail
      ) {
        throw new Error(
          "Synthetic account creation returned an unexpected identity.",
        );
      }

      knownUserIds.add(user.id);
      uncertainEmails.delete(normalizedEmail);
    },
  };
}

async function listMatchingUserIds(admin, attemptedEmails) {
  const matchingUserIds = new Set();

  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    let result;
    try {
      result = await admin.auth.admin.listUsers({
        page,
        perPage: LIST_PAGE_SIZE,
      });
    } catch {
      throw new Error("Synthetic account reconciliation request failed.");
    }
    if (result.error || !Array.isArray(result.data?.users)) {
      throw new Error("Synthetic account reconciliation was rejected.");
    }

    for (const user of result.data.users) {
      if (
        typeof user.id === "string" &&
        typeof user.email === "string" &&
        attemptedEmails.has(user.email.toLowerCase())
      ) {
        matchingUserIds.add(user.id);
      }
    }
    if (result.data.users.length < LIST_PAGE_SIZE) {
      return matchingUserIds;
    }
  }

  throw new Error(
    "Synthetic account reconciliation exceeded the user-page safety limit.",
  );
}

async function deleteUserIds(admin, userIds) {
  await Promise.allSettled(
    [...userIds].map((userId) =>
      admin.auth.admin.deleteUser(userId),
    ),
  );
}

function normalizeTrackedEmail(email, emailPrefix) {
  if (
    typeof email !== "string" ||
    !email.startsWith(emailPrefix) ||
    !email.endsWith("@example.test") ||
    /[\r\n]/.test(email)
  ) {
    throw new Error("Synthetic account email is outside the guarded prefix.");
  }
  return email.toLowerCase();
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
