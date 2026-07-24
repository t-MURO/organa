import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const localEnvironment = readLocalEnvironment();
const apiUrl = localEnvironment.API_URL;
const publishableKey = localEnvironment.PUBLISHABLE_KEY;
const serviceRoleKey = localEnvironment.SERVICE_ROLE_KEY;

if (!apiUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("The local Supabase environment is unavailable.");
}

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
};
const users = [];
const checks = [];

try {
  await verifyDeviceApprovalContract();
  console.log(`Local Supabase verification passed (${checks.length} checks).`);
} finally {
  await Promise.all(
    users.map((user) => admin.auth.admin.deleteUser(user.id)),
  );
}

async function verifyDeviceApprovalContract() {
  const suffix = randomUUID().slice(0, 8);
  const password = `Organa-${randomUUID()}-Aa1!`;
  for (const index of [1, 2]) {
    const created = await admin.auth.admin.createUser({
      email: `approval-${suffix}-${index}@example.test`,
      email_confirm: true,
      password,
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("User creation failed.");
    }
    users.push(created.data.user);
  }

  const client1 = createClient(apiUrl, publishableKey, clientOptions);
  const client2 = createClient(apiUrl, publishableKey, clientOptions);
  noError(
    await client1.auth.signInWithPassword({
      email: users[0].email,
      password,
    }),
    "account one authenticated",
  );
  noError(
    await client2.auth.signInWithPassword({
      email: users[1].email,
      password,
    }),
    "account two authenticated",
  );

  const trustedDeviceId = randomUUID();
  const approvedDeviceId = randomUUID();
  const rejectedDeviceId = randomUUID();
  const blockedDeviceId = randomUUID();
  const otherDeviceId = randomUUID();
  const trustedProof = "1".repeat(72);
  const approvedProof = "2".repeat(72);
  const rejectedProof = "3".repeat(72);
  const blockedProof = "4".repeat(72);
  const otherProof = "9".repeat(72);
  const keyId = randomUUID();
  const otherKeyId = randomUUID();
  const recoveryProof = "a".repeat(64);

  noError(
    await client1.rpc("enroll_account_key", {
      p_device_id: trustedDeviceId,
      p_device_name: "Trusted browser",
      p_device_platform: "web",
      p_device_proof: trustedProof,
      p_key_id: keyId,
      p_recovery_key_envelope: fakeRecoveryEnvelope(keyId, "A"),
      p_recovery_proof: recoveryProof,
    }),
    "first account and trusted device enrolled",
  );
  noError(
    await client2.rpc("enroll_account_key", {
      p_device_id: otherDeviceId,
      p_device_name: "Other browser",
      p_device_platform: "web",
      p_device_proof: otherProof,
      p_key_id: otherKeyId,
      p_recovery_key_envelope: fakeRecoveryEnvelope(otherKeyId, "B"),
      p_recovery_proof: "b".repeat(64),
    }),
    "second account enrolled",
  );

  noError(
    await client1.rpc("request_device_approval", {
      p_device_id: approvedDeviceId,
      p_device_proof: approvedProof,
      p_name: "New phone",
      p_platform: "ios",
    }),
    "new device approval requested",
  );
  const pending = noError(
    await client1
      .from("devices")
      .select("trusted_at,revoked_at")
      .eq("id", approvedDeviceId)
      .single(),
    "pending device is visible",
  );
  ok(
    pending.trusted_at === null && pending.revoked_at === null,
    "pending device is not trusted prematurely",
  );

  const crossAccount = noError(
    await client2
      .from("device_approvals")
      .select("device_id")
      .eq("user_id", users[0].id),
    "cross-account approval read evaluated",
  );
  ok(crossAccount.length === 0, "RLS hides another account approval");
  expectedError(
    await client2.from("device_approvals").insert({
      device_id: otherDeviceId,
      user_id: users[1].id,
    }),
    /permission denied|row-level security/i,
    "direct approval writes are blocked",
  );

  const envelope = {
    algorithm: "AES-256-GCM",
    combined: "C".repeat(80),
    keyId,
    targetDeviceId: approvedDeviceId,
    version: 1,
  };
  expectedError(
    await client1.rpc("approve_trusted_device", {
      p_current_device_id: trustedDeviceId,
      p_current_device_proof: "wrong-proof".repeat(8),
      p_encrypted_content_key: envelope,
      p_target_device_id: approvedDeviceId,
    }),
    /proof is invalid/i,
    "invalid approver proof is rejected",
  );
  noError(
    await client1.rpc("approve_trusted_device", {
      p_current_device_id: trustedDeviceId,
      p_current_device_proof: trustedProof,
      p_encrypted_content_key: envelope,
      p_target_device_id: approvedDeviceId,
    }),
    "trusted device approved encrypted handoff",
  );

  const approved = noError(
    await client1
      .from("device_approvals")
      .select("encrypted_content_key,approved_at,claimed_at")
      .eq("device_id", approvedDeviceId)
      .single(),
    "approved envelope is retrievable",
  );
  ok(
    approved.approved_at &&
      !approved.claimed_at &&
      approved.encrypted_content_key.targetDeviceId === approvedDeviceId,
    "approval remains encrypted and bound to target",
  );

  expectedError(
    await client1.rpc("complete_device_approval", {
      p_device_id: approvedDeviceId,
      p_device_proof: "wrong-proof".repeat(8),
    }),
    /proof is invalid/i,
    "invalid target proof is rejected",
  );
  noError(
    await client1.rpc("complete_device_approval", {
      p_device_id: approvedDeviceId,
      p_device_proof: approvedProof,
    }),
    "approved device claimed handoff",
  );

  const claimedDevice = noError(
    await client1
      .from("devices")
      .select("trusted_at,primary_reminder,notifications_enabled")
      .eq("id", approvedDeviceId)
      .single(),
    "claimed device loaded",
  );
  ok(
    Boolean(claimedDevice.trusted_at) &&
      !claimedDevice.primary_reminder &&
      !claimedDevice.notifications_enabled,
    "claimed secondary device starts trusted and quiet",
  );
  const claimedApproval = noError(
    await client1
      .from("device_approvals")
      .select("encrypted_content_key,claimed_at")
      .eq("device_id", approvedDeviceId)
      .single(),
    "claimed approval loaded",
  );
  ok(
    claimedApproval.encrypted_content_key === null &&
      Boolean(claimedApproval.claimed_at),
    "claimed envelope is erased",
  );

  noError(
    await client1.rpc("configure_reminder_device", {
      p_current_device_id: trustedDeviceId,
      p_current_device_proof: trustedProof,
      p_device_id: approvedDeviceId,
      p_make_primary: true,
      p_notifications_enabled: true,
    }),
    "claimed device promoted to primary reminder",
  );
  const promotedDevices = noError(
    await client1
      .from("devices")
      .select("id,primary_reminder,notifications_enabled")
      .in("id", [trustedDeviceId, approvedDeviceId]),
    "promoted reminder devices loaded",
  );
  const promoted = promotedDevices.find(
    (device) => device.id === approvedDeviceId,
  );
  const demoted = promotedDevices.find(
    (device) => device.id === trustedDeviceId,
  );
  ok(
    promoted?.primary_reminder &&
      promoted.notifications_enabled &&
      !demoted?.primary_reminder &&
      !demoted?.notifications_enabled,
    "promoting a primary quietly demotes the previous primary",
  );

  noError(
    await client1.rpc("configure_reminder_device", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: approvedProof,
      p_device_id: trustedDeviceId,
      p_make_primary: true,
      p_notifications_enabled: true,
    }),
    "original device restored as primary reminder",
  );
  const restoredDevices = noError(
    await client1
      .from("devices")
      .select("id,primary_reminder,notifications_enabled")
      .in("id", [trustedDeviceId, approvedDeviceId]),
    "restored reminder devices loaded",
  );
  const restored = restoredDevices.find(
    (device) => device.id === trustedDeviceId,
  );
  const quietSecondary = restoredDevices.find(
    (device) => device.id === approvedDeviceId,
  );
  ok(
    restored?.primary_reminder &&
      restored.notifications_enabled &&
      !quietSecondary?.primary_reminder &&
      !quietSecondary?.notifications_enabled,
    "demoted secondary stays quiet until explicitly enabled",
  );

  noError(
    await client1.rpc("request_device_approval", {
      p_device_id: rejectedDeviceId,
      p_device_proof: rejectedProof,
      p_name: "Unknown browser",
      p_platform: "web",
    }),
    "rejectable request created",
  );
  noError(
    await client1.rpc("reject_device_approval", {
      p_current_device_id: trustedDeviceId,
      p_current_device_proof: trustedProof,
      p_target_device_id: rejectedDeviceId,
    }),
    "pending request rejected",
  );
  const rejected = noError(
    await client1.from("devices").select("id").eq("id", rejectedDeviceId),
    "rejected device checked",
  );
  ok(rejected.length === 0, "rejected untrusted device is removed");

  noError(
    await client1.rpc("request_account_deletion", {
      p_device_id: trustedDeviceId,
      p_device_proof: trustedProof,
    }),
    "account deletion requested",
  );
  expectedError(
    await client1.rpc("request_device_approval", {
      p_device_id: blockedDeviceId,
      p_device_proof: blockedProof,
      p_name: "Blocked browser",
      p_platform: "web",
    }),
    /read-only/i,
    "approval request blocked during deletion",
  );
  expectedError(
    await client1.rpc("register_trusted_device", {
      p_device_id: blockedDeviceId,
      p_device_proof: blockedProof,
      p_name: "Blocked browser",
      p_platform: "web",
      p_recovery_proof: recoveryProof,
    }),
    /read-only/i,
    "recovery enrollment blocked during deletion",
  );
  noError(
    await client1.rpc("cancel_account_deletion", {
      p_device_id: trustedDeviceId,
      p_device_proof: trustedProof,
    }),
    "account deletion cancelled",
  );

  noError(
    await client1.rpc("revoke_trusted_device", {
      p_current_device_id: trustedDeviceId,
      p_current_device_proof: trustedProof,
      p_target_device_id: approvedDeviceId,
    }),
    "approved device revoked",
  );
  expectedError(
    await client1.rpc("request_device_approval", {
      p_device_id: approvedDeviceId,
      p_device_proof: approvedProof,
      p_name: "Revoked phone",
      p_platform: "ios",
    }),
    /requires recovery-key enrollment/i,
    "revoked device cannot self-request reapproval",
  );

  const anonymous = createClient(apiUrl, publishableKey, clientOptions);
  expectedError(
    await anonymous.rpc("request_device_approval", {
      p_device_id: randomUUID(),
      p_device_proof: "7".repeat(72),
      p_name: "Anonymous",
      p_platform: "web",
    }),
    /Authentication is required|permission denied/i,
    "anonymous approval request is rejected",
  );
}

function fakeRecoveryEnvelope(keyId, fill) {
  return {
    algorithm: "AES-256-GCM",
    combined: fill.repeat(80),
    keyId,
    version: 1,
  };
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

function noError(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  checks.push(label);
  return result.data;
}

function expectedError(result, pattern, label) {
  ok(
    Boolean(result.error && pattern.test(result.error.message)),
    `${label} (${result.error?.message ?? "no error"})`,
  );
}

function readLocalEnvironment() {
  const output = execFileSync(
    "pnpm",
    ["dlx", "supabase@latest", "status", "-o", "env"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  return Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}
