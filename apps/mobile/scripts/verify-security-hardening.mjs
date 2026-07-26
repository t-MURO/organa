import { readFile } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const repoRoot = new URL("../../../", import.meta.url);
const [
  deviceBoundStore,
  authStorageNative,
  authStorageWeb,
  supabaseClient,
  contentKeyVaultNative,
  deviceApprovalKeyVaultNative,
  deviceIdentity,
  appLockAdapter,
  deletionCache,
  reminderCache,
  androidWidgetSnapshot,
  contentKeyVaultWeb,
  deviceApprovalKeyVaultWeb,
  exportWriter,
  backupReader,
  payloadBoundsMigration,
  deviceApprovalExchangeMigration,
] = await Promise.all([
  readAppSource("src/security/device-bound-secure-store.ts"),
  readAppSource("src/auth/auth-storage.native.ts"),
  readAppSource("src/auth/auth-storage.web.ts"),
  readAppSource("src/auth/supabase.ts"),
  readAppSource("src/security/content-key-vault.native.ts"),
  readAppSource("src/security/device-approval-key-vault.native.ts"),
  readAppSource("src/security/device-identity.native.ts"),
  readAppSource("src/security/create-app-lock-adapter.native.ts"),
  readAppSource("src/features/account/account-deletion-cache.native.ts"),
  readAppSource(
    "src/features/account/reminder-authorization-cache.native.ts",
  ),
  readAppSource(
    "src/features/widgets/android-widget-snapshot.android.ts",
  ),
  readAppSource("src/security/content-key-vault.web.ts"),
  readAppSource("src/security/device-approval-key-vault.web.ts"),
  readAppSource("src/data/create-export-file-writer.native.ts"),
  readAppSource("src/data/create-backup-file-reader.native.ts"),
  readFile(
    new URL(
      "supabase/migrations/20260726120000_encrypted_payload_bounds.sql",
      repoRoot,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "supabase/migrations/20260726180000_device_approval_exchange.sql",
      repoRoot,
    ),
    "utf8",
  ),
]);

const checks = [];

ok(
  deviceBoundStore.includes("WHEN_UNLOCKED_THIS_DEVICE_ONLY") &&
    deviceBoundStore.includes("Rewriting also migrates older iOS entries"),
  "native private state is device-bound and migrates legacy entries",
);

for (const [label, source] of [
  ["auth storage", authStorageNative],
  ["content-key vault", contentKeyVaultNative],
  ["device-approval key", deviceApprovalKeyVaultNative],
  ["device identity", deviceIdentity],
  ["app-lock preference", appLockAdapter],
  ["deletion cache", deletionCache],
  ["reminder authorization", reminderCache],
  ["Android widget snapshot", androidWidgetSnapshot],
]) {
  ok(
    source.includes("device-bound-secure-store") &&
      !source.includes('from "expo-secure-store"'),
    `${label} uses the device-bound SecureStore adapter`,
  );
}

ok(
  authStorageWeb.includes('typeof localStorage === "undefined"') &&
    authStorageWeb.includes("getProtectedBrowserValue") &&
    authStorageWeb.includes("removeProtectedBrowserValue") &&
    !authStorageWeb.includes("setProtectedBrowserValue"),
  "browser auth sessions persist durably and migrate the previous vault entry",
);
ok(
  supabaseClient.includes('url.protocol !== "https:"') &&
    supabaseClient.includes("\\.supabase\\.co$") &&
    !supabaseClient.includes('"localhost"') &&
    !supabaseClient.includes('"127.0.0.1"'),
  "client accepts only managed HTTPS Supabase origins",
);

ok(
  contentKeyVaultWeb.includes("version?: 2") &&
    contentKeyVaultWeb.includes("version: 2") &&
    contentKeyVaultWeb.includes("additionalData: vaultAdditionalData(userId)") &&
    contentKeyVaultWeb.includes("wrapped.version !== 2"),
  "browser content keys are account-bound with legacy migration",
);
ok(
  deviceApprovalKeyVaultWeb.includes("protected-browser-storage") &&
    !deviceApprovalKeyVaultWeb.includes("localStorage"),
  "browser device-approval keys use protected storage",
);
ok(
  exportWriter.includes("finally") &&
    exportWriter.includes("if (file.exists) file.delete()"),
  "native export cache files are removed after sharing",
);
ok(
  backupReader.includes("finally") &&
    backupReader.includes("if (file.exists) file.delete()"),
  "native imported backup copies are removed after reading",
);
ok(
  payloadBoundsMigration.includes("pg_column_size(new.ciphertext) > 4194304") &&
    payloadBoundsMigration.includes(
      "pg_column_size(new.field_versions) > 65536",
    ) &&
    payloadBoundsMigration.includes("field_count > 128") &&
    payloadBoundsMigration.includes(
      "encrypted_records_enforce_payload_bounds",
    ) &&
    payloadBoundsMigration.includes(
      "sync_mutations_enforce_payload_bounds",
    ) &&
    payloadBoundsMigration.includes(
      "revoke execute on function public.enforce_encrypted_payload_bounds()",
    ),
  "database bounds encrypted payloads and field metadata",
);
ok(
  deviceApprovalExchangeMigration.includes(
    "X25519-HKDF-SHA256-AES-256-GCM",
  ) &&
    deviceApprovalExchangeMigration.includes(
      "request_public_key =\n      p_encrypted_content_key ->> 'recipientPublicKey'",
    ) &&
    deviceApprovalExchangeMigration.includes(
      "request_public_key = null",
    ),
  "device approval is bound to its exchange key and erases the handoff",
);

console.log(
  `Security hardening verification passed (${checks.length} checks).`,
);

function readAppSource(path) {
  return readFile(new URL(path, appRoot), "utf8");
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}
