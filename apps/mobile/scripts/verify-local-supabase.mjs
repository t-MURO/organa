import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const verificationEnvironment = readVerificationEnvironment();
const apiUrl = verificationEnvironment.apiUrl;
const publishableKey = verificationEnvironment.publishableKey;
const serviceRoleKey = verificationEnvironment.serviceRoleKey;
const interruptionController = new AbortController();

if (!apiUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("The Supabase verification environment is unavailable.");
}

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false },
  global: { fetch: verificationFetch },
});
const cleanupAdmin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false },
  global: { fetch: cleanupFetch },
});
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: verificationFetch },
};
const users = [];
const checks = [];
let interruptedSignal;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interruptedSignal ??= signal;
    interruptionController.abort();
  });
}

try {
  if (verificationEnvironment.connected) {
    await verifyConnectedAuthSettings();
  }
  await verifyDeviceApprovalContract();
  console.log(
    `${verificationEnvironment.label} Supabase verification passed (${checks.length} checks).`,
  );
} finally {
  await deleteSyntheticUsers();
}

async function verifyConnectedAuthSettings() {
  let response;
  try {
    response = await verificationFetch(`${apiUrl}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
    });
  } catch {
    throwIfInterrupted();
    throw new Error(
      "Connected Auth settings could not be reached within 20 seconds.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Connected Auth settings request failed with status ${response.status}.`,
    );
  }

  let settings;
  try {
    settings = await response.json();
  } catch {
    throw new Error("Connected Auth settings did not return valid JSON.");
  }
  const external = settings?.external;
  ok(external && typeof external === "object", "Auth settings are available");
  ok(external.email === true, "email authentication is enabled");
  ok(external.phone === false, "phone authentication is disabled");
  ok(external.google === true, "Google authentication is enabled");
  ok(external.apple === true, "Apple authentication is enabled");
  ok(external.github === true, "GitHub authentication is enabled");
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
    throwIfInterrupted();
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

  if (verificationEnvironment.connected) {
    await verifyRealtimeAndDurableReconciliation({
      client: client1,
      deviceId: trustedDeviceId,
      deviceProof: trustedProof,
      email: users[0].email,
      keyId,
      otherClient: client2,
      password,
      userId: users[0].id,
    });
  }

  noError(
    await client1.rpc("request_device_approval", {
      p_device_id: approvedDeviceId,
      p_device_proof: approvedProof,
      p_name: "New browser",
      p_platform: "web",
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

  const webPushSubscription = {
    auth: "B".repeat(22),
    endpoint: "https://push.example.test/subscription",
    expirationTime: null,
    p256dh: "A".repeat(65),
  };
  const webPushEntries = [
    {
      fireAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      key: "task:at-due",
      route: "/focus?taskId=opaque-task",
    },
  ];
  expectedError(
    await client1.rpc("replace_web_push_schedule", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: "wrong-proof".repeat(8),
      p_entries: webPushEntries,
      p_scope: "task:opaque-task",
      p_subscription: webPushSubscription,
    }),
    /proof is invalid/i,
    "invalid Web Push device proof is rejected",
  );
  expectedError(
    await client2.rpc("replace_web_push_schedule", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: approvedProof,
      p_entries: webPushEntries,
      p_scope: "task:opaque-task",
      p_subscription: webPushSubscription,
    }),
    /proof is invalid/i,
    "cross-account Web Push device proof is rejected",
  );
  expectedError(
    await client1.rpc("replace_web_push_schedule", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: approvedProof,
      p_entries: webPushEntries,
      p_scope: "task:opaque-task",
      p_subscription: webPushSubscription,
    }),
    /not enabled/i,
    "quiet secondary device cannot schedule Web Push",
  );
  expectedError(
    await client1.from("web_push_subscriptions").select("id"),
    /permission denied/i,
    "Web Push capability URLs are hidden from authenticated clients",
  );
  expectedError(
    await client1.from("web_push_reminders").insert({
      fire_at: new Date().toISOString(),
      reminder_key: "forbidden",
      route: "/",
      scope: "forbidden",
      subscription_id: randomUUID(),
    }),
    /permission denied/i,
    "direct Web Push reminder writes are blocked",
  );
  expectedError(
    await client1.rpc("claim_due_web_push_reminders", { p_limit: 10 }),
    /permission denied/i,
    "authenticated clients cannot claim Web Push deliveries",
  );
  noError(
    await client1.rpc("configure_reminder_device", {
      p_current_device_id: trustedDeviceId,
      p_current_device_proof: trustedProof,
      p_device_id: approvedDeviceId,
      p_make_primary: false,
      p_notifications_enabled: true,
    }),
    "secondary Web Push reminders explicitly enabled",
  );
  noError(
    await client1.rpc("replace_web_push_schedule", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: approvedProof,
      p_entries: webPushEntries,
      p_scope: "task:opaque-task",
      p_subscription: webPushSubscription,
    }),
    "proof-gated Web Push schedule stored",
  );
  const storedWebPush = noError(
    await admin
      .from("web_push_subscriptions")
      .select(
        "endpoint,web_push_reminders(scope,reminder_key,route,fire_at)",
      )
      .eq("user_id", users[0].id)
      .eq("device_id", approvedDeviceId)
      .single(),
    "service role loaded Web Push operational metadata",
  );
  ok(
    storedWebPush.endpoint === webPushSubscription.endpoint &&
      storedWebPush.web_push_reminders.length === 1 &&
      storedWebPush.web_push_reminders[0].scope === "task:opaque-task" &&
      storedWebPush.web_push_reminders[0].route ===
        "/focus?taskId=opaque-task" &&
      !JSON.stringify(storedWebPush).includes("Private"),
    "Web Push storage contains only capability and routing metadata",
  );
  expectedError(
    await client1.rpc("remove_current_web_push_subscription", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: "wrong-proof".repeat(8),
    }),
    /proof is invalid/i,
    "invalid proof cannot remove a Web Push subscription",
  );
  noError(
    await client1.rpc("remove_current_web_push_subscription", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: approvedProof,
    }),
    "signed-in browser removed its Web Push subscription",
  );
  const removedWebPush = noError(
    await admin
      .from("web_push_subscriptions")
      .select("id")
      .eq("user_id", users[0].id)
      .eq("device_id", approvedDeviceId),
    "removed Web Push subscription checked",
  );
  ok(
    removedWebPush.length === 0,
    "subscription removal cascades scheduled Web Push reminders",
  );
  noError(
    await client1.rpc("replace_web_push_schedule", {
      p_current_device_id: approvedDeviceId,
      p_current_device_proof: approvedProof,
      p_entries: webPushEntries,
      p_scope: "task:opaque-task",
      p_subscription: webPushSubscription,
    }),
    "Web Push schedule restored for demotion verification",
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
  const demotedSubscriptions = noError(
    await admin
      .from("web_push_subscriptions")
      .select("id")
      .eq("user_id", users[0].id)
      .eq("device_id", approvedDeviceId),
    "demoted Web Push subscriptions checked",
  );
  ok(
    demotedSubscriptions.length === 0,
    "demotion removes the quiet device Web Push subscription",
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

async function verifyRealtimeAndDurableReconciliation({
  client,
  deviceId,
  deviceProof,
  email,
  keyId,
  otherClient,
  password,
  userId,
}) {
  const peer = createClient(apiUrl, publishableKey, clientOptions);
  let channel;
  try {
    noError(
      await peer.auth.signInWithPassword({ email, password }),
      "second same-account session authenticated",
    );
    await peer.realtime.setAuth();

    const realtimeRecordId = `realtime-${randomUUID()}`;
    let resolveSignal;
    const signalPromise = new Promise((resolveSignalPromise) => {
      resolveSignal = resolveSignalPromise;
    });
    let resolveSubscription;
    let rejectSubscription;
    const subscriptionPromise = new Promise((resolve, reject) => {
      resolveSubscription = resolve;
      rejectSubscription = reject;
    });
    let subscriptionSettled = false;

    channel = peer
      .channel(`organa:${userId}:encrypted-records`, {
        config: { private: true },
      })
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        if (
          payload?.recordId === realtimeRecordId &&
          payload?.recordType === "task"
        ) {
          resolveSignal({
            payload,
            receivedAt: performance.now(),
          });
        }
      })
      .subscribe((status) => {
        if (subscriptionSettled) return;
        if (status === "SUBSCRIBED") {
          subscriptionSettled = true;
          resolveSubscription();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          subscriptionSettled = true;
          rejectSubscription(
            new Error("The private Realtime channel could not subscribe."),
          );
        }
      });

    await withTimeout(
      subscriptionPromise,
      15_000,
      "The private Realtime channel did not subscribe within 15 seconds.",
    );
    ok(true, "private encrypted-record channel subscribed");

    const realtimeTimestamp = new Date().toISOString();
    const realtimeCiphertext = {
      title: fakeRecordEnvelope(keyId, "R"),
    };
    const mutationStartedAt = performance.now();
    noError(
      await client.rpc("apply_encrypted_mutation", {
        p_base_version: 0,
        p_ciphertext: realtimeCiphertext,
        p_created_at: realtimeTimestamp,
        p_device_id: deviceId,
        p_device_proof: deviceProof,
        p_field_versions: { title: realtimeTimestamp },
        p_mutation_id: randomUUID(),
        p_operation: "upsert",
        p_record_id: realtimeRecordId,
        p_record_type: "task",
      }),
      "connected encrypted mutation applied",
    );

    const signal = await withTimeout(
      signalPromise,
      10_000,
      "The encrypted-record broadcast was not received within 10 seconds.",
    );
    ok(
      signal.payload.recordId === realtimeRecordId &&
        signal.payload.recordType === "task" &&
        sameJson(Object.keys(signal.payload).sort(), [
          "recordId",
          "recordType",
        ]),
      "Realtime broadcast exposes only the expected record hint",
    );
    const latencyMilliseconds = Math.round(
      signal.receivedAt - mutationStartedAt,
    );
    ok(
      latencyMilliseconds <= 1_000,
      `encrypted change reached the active peer in ${latencyMilliseconds} ms`,
    );

    const realtimeRow = noError(
      await peer
        .from("encrypted_records")
        .select("record_id,ciphertext,updated_at")
        .eq("record_type", "task")
        .eq("record_id", realtimeRecordId)
        .single(),
      "active peer loaded the durable encrypted record",
    );
    ok(
      sameJson(realtimeRow.ciphertext, realtimeCiphertext),
      "durable Realtime row remains ciphertext-only",
    );
    const crossAccountRows = noError(
      await otherClient
        .from("encrypted_records")
        .select("record_id")
        .eq("record_type", "task")
        .eq("record_id", realtimeRecordId),
      "cross-account encrypted-record read evaluated",
    );
    ok(
      crossAccountRows.length === 0,
      "RLS hides connected ciphertext from another account",
    );
    expectedError(
      await otherClient.rpc("apply_encrypted_mutation", {
        p_base_version: 0,
        p_ciphertext: realtimeCiphertext,
        p_created_at: realtimeTimestamp,
        p_device_id: deviceId,
        p_device_proof: deviceProof,
        p_field_versions: { title: realtimeTimestamp },
        p_mutation_id: randomUUID(),
        p_operation: "upsert",
        p_record_id: `cross-account-${randomUUID()}`,
        p_record_type: "task",
      }),
      /device proof is invalid/i,
      "cross-account encrypted mutation is rejected",
    );

    const removalStatus = await peer.removeChannel(channel);
    channel = undefined;
    ok(
      removalStatus === "ok",
      "second client disconnected before the missed-broadcast mutation",
    );

    const reconciliationRecordId = `reconcile-${randomUUID()}`;
    const reconciliationTimestamp = new Date().toISOString();
    const reconciliationCiphertext = {
      details: fakeRecordEnvelope(keyId, "D"),
    };
    noError(
      await client.rpc("apply_encrypted_mutation", {
        p_base_version: 0,
        p_ciphertext: reconciliationCiphertext,
        p_created_at: reconciliationTimestamp,
        p_device_id: deviceId,
        p_device_proof: deviceProof,
        p_field_versions: { details: reconciliationTimestamp },
        p_mutation_id: randomUUID(),
        p_operation: "upsert",
        p_record_id: reconciliationRecordId,
        p_record_type: "task",
      }),
      "encrypted mutation persisted while the peer was disconnected",
    );

    const cursor = overlapSyncCursor(realtimeRow.updated_at);
    const reconciliationRows = noError(
      await peer
        .from("encrypted_records")
        .select("record_id,ciphertext,updated_at")
        .gt("updated_at", cursor)
        .order("updated_at", { ascending: true })
        .order("record_type", { ascending: true })
        .order("record_id", { ascending: true })
        .limit(100),
      "disconnected peer ran durable cursor reconciliation",
    );
    const recovered = reconciliationRows.find(
      (row) => row.record_id === reconciliationRecordId,
    );
    ok(
      Boolean(recovered),
      "durable reconciliation recovered the missed encrypted record",
    );
    ok(
      sameJson(recovered?.ciphertext, reconciliationCiphertext),
      "recovered record remains ciphertext-only",
    );
  } finally {
    if (channel) {
      await peer.removeChannel(channel).catch(() => undefined);
    }
    await peer.realtime.disconnect().catch(() => undefined);
  }
}

function fakeRecoveryEnvelope(keyId, fill) {
  return {
    algorithm: "AES-256-GCM",
    combined: fill.repeat(80),
    keyId,
    version: 1,
  };
}

function fakeRecordEnvelope(keyId, fill) {
  return {
    algorithm: "AES-256-GCM",
    combined: fill.repeat(80),
    keyId,
    version: 1,
  };
}

function overlapSyncCursor(cursor) {
  const timestamp = new Date(cursor).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("The durable Realtime cursor is invalid.");
  }
  return new Date(timestamp - 1).toISOString();
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function withTimeout(promise, timeoutMilliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function ok(condition, label) {
  throwIfInterrupted();
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

function noError(result, label) {
  throwIfInterrupted();
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

async function deleteSyntheticUsers() {
  const pendingUsers = users.splice(0);
  const results = await Promise.all(
    pendingUsers.map((user) => cleanupAdmin.auth.admin.deleteUser(user.id)),
  );
  if (results.some((result) => result.error)) {
    throw new Error(
      "Synthetic account cleanup failed; inspect Auth users with the approval- prefix.",
    );
  }
}

function throwIfInterrupted() {
  if (interruptedSignal) {
    throw new Error(
      `Supabase verification interrupted by ${interruptedSignal}; cleaning up synthetic accounts.`,
    );
  }
}

function verificationFetch(input, init = {}) {
  return fetchWithSignals(input, init, interruptionController.signal);
}

function cleanupFetch(input, init = {}) {
  return fetchWithSignals(input, init);
}

function fetchWithSignals(input, init, additionalSignal) {
  const signals = [AbortSignal.timeout(20_000)];
  if (init.signal) signals.push(init.signal);
  if (additionalSignal) signals.push(additionalSignal);
  return fetch(input, {
    ...init,
    signal: AbortSignal.any(signals),
  });
}

function readVerificationEnvironment() {
  const [mode, configPath, ...unexpected] = process.argv.slice(2);
  if (!mode) {
    const local = readLocalEnvironment();
    return {
      apiUrl: local.API_URL,
      connected: false,
      label: "Local",
      publishableKey: local.PUBLISHABLE_KEY,
      serviceRoleKey: local.SERVICE_ROLE_KEY,
    };
  }
  if (mode !== "--connected" || unexpected.length > 0) {
    throw new Error(
      "Usage: node verify-local-supabase.mjs [--connected [config-path]]",
    );
  }
  return readConnectedEnvironment(configPath);
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

function readConnectedEnvironment(configPath) {
  const config = readConnectedSupabaseConfig(configPath);

  return {
    apiUrl: config.supabaseUrl,
    connected: true,
    label: "Connected",
    publishableKey: config.publishableKey,
    serviceRoleKey: config.secretKey,
  };
}
