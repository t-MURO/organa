import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";
import { createSyntheticAccountTracker } from "./synthetic-account-tracker.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
const syntheticAccounts = createSyntheticAccountTracker({
  emailPrefix: "approval-",
});
const users = [];
const checks = [];
let interruptedSignal;
const handledSignals =
  process.platform === "win32"
    ? ["SIGINT", "SIGTERM"]
    : ["SIGHUP", "SIGINT", "SIGTERM"];

for (const signal of handledSignals) {
  process.on(signal, () => {
    interruptedSignal ??= signal;
    interruptionController.abort();
  });
}

let runFailure;
try {
  if (verificationEnvironment.verifyAuthSettings) {
    await verifyConnectedAuthSettings();
  }
  await verifyDeviceApprovalContract();
} catch (error) {
  runFailure =
    error instanceof Error
      ? error
      : new Error("Supabase verification failed.");
}

let cleanupFailure;
try {
  await deleteSyntheticUsers();
} catch {
  cleanupFailure = new Error(
    "Synthetic account cleanup failed; inspect Auth users with the approval- prefix.",
  );
}

if (interruptedSignal && !runFailure) {
  runFailure = new Error(
    `Supabase verification was interrupted by ${interruptedSignal}.`,
  );
}
if (runFailure) {
  if (cleanupFailure) console.error(cleanupFailure.message);
  throw runFailure;
}
if (cleanupFailure) throw cleanupFailure;

console.log(
  `${verificationEnvironment.label} Supabase verification passed (${checks.length} checks).`,
);

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
  ok(external.google === false, "Google authentication is disabled");
  ok(external.github === false, "GitHub authentication is disabled");
}

async function verifyDeviceApprovalContract() {
  const suffix = randomUUID().slice(0, 8);
  const password = `Organa-${randomUUID()}-Aa1!`;
  for (const index of [1, 2]) {
    const email = `approval-${suffix}-${index}@example.test`;
    syntheticAccounts.recordAttempt(email);
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    syntheticAccounts.recordCreationResult(email, created);
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

  await verifyEncryptedBrainDumpContract({
    client: client1,
    connected: verificationEnvironment.connected,
    currentDeviceId: trustedDeviceId,
    currentDeviceProof: trustedProof,
    email: users[0].email,
    keyId,
    password,
    targetDeviceId: approvedDeviceId,
    targetDeviceProof: approvedProof,
    userId: users[0].id,
  });

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

  if (verificationEnvironment.connected) {
    await verifyConnectedReminderDeviceSessions({
      client: client1,
      currentDeviceId: trustedDeviceId,
      currentDeviceProof: trustedProof,
      email: users[0].email,
      password,
      targetDeviceId: approvedDeviceId,
      targetDeviceProof: approvedProof,
      userId: users[0].id,
    });
  } else {
    noError(
      await client1.rpc("revoke_trusted_device", {
        p_current_device_id: trustedDeviceId,
        p_current_device_proof: trustedProof,
        p_target_device_id: approvedDeviceId,
      }),
      "approved device revoked",
    );
  }
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

async function verifyEncryptedBrainDumpContract({
  client,
  connected,
  currentDeviceId,
  currentDeviceProof,
  email,
  keyId,
  password,
  targetDeviceId,
  targetDeviceProof,
  userId,
}) {
  const peer = createClient(apiUrl, publishableKey, clientOptions);
  const contentKey = await webcrypto.subtle.importKey(
    "raw",
    randomBytes(32),
    "AES-GCM",
    false,
    ["decrypt", "encrypt"],
  );
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const bulletId = `thought-${Date.now().toString(36)}-${suffix}`;
  const baseTimestamp = new Date().toISOString();
  const baseDocument = new Y.Doc();
  baseDocument.getText("text").insert(0, "Plan");
  const baseState = encodeBytes(Y.encodeStateAsUpdate(baseDocument));
  const baseBullet = {
    createdAt: baseTimestamp,
    crdtState: baseState,
    id: bulletId,
    rank: 1_024,
    text: "Plan",
    updatedAt: baseTimestamp,
  };
  const leftUpdate = createBrainDumpEdit({
    baseState,
    bulletId,
    createdAt: nextIsoTimestamp(baseTimestamp, 1),
    insertion: " alpha",
    suffix: `left-${suffix}`,
  });
  const rightUpdate = createBrainDumpEdit({
    baseState,
    bulletId,
    createdAt: nextIsoTimestamp(baseTimestamp, 2),
    insertion: " beta",
    suffix: `right-${suffix}`,
  });
  let channel;

  try {
    noError(
      await peer.auth.signInWithPassword({ email, password }),
      "second Brain Dump session authenticated",
    );

    const baseMutation = await applyEncryptedValue({
      client,
      contentKey,
      createdAt: baseTimestamp,
      deviceId: currentDeviceId,
      deviceProof: currentDeviceProof,
      keyId,
      label: "encrypted Brain Dump bullet persisted",
      recordId: bulletId,
      recordType: "brain_dump_bullet",
      value: baseBullet,
    });
    ok(
      baseMutation.version === 1,
      "Brain Dump bullet starts at version one",
    );

    let signalPromise;
    let leftMutationStartedAt;
    if (connected) {
      await peer.realtime.setAuth();
      let resolveSignal;
      signalPromise = new Promise((resolve) => {
        resolveSignal = resolve;
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
        .on("broadcast", { event: "changed" }, ({ meta, payload }) => {
          if (
            payload?.recordId === leftUpdate.id &&
            payload?.recordType === "brain_dump_update"
          ) {
            resolveSignal({
              messageId: meta?.id,
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
              new Error(
                "The Brain Dump private Realtime channel could not subscribe.",
              ),
            );
          }
        });
      await withTimeout(
        subscriptionPromise,
        15_000,
        "The Brain Dump private Realtime channel did not subscribe within 15 seconds.",
      );
      ok(true, "Brain Dump private Realtime channel subscribed");
      leftMutationStartedAt = performance.now();
    }

    const leftMutation = await applyEncryptedValue({
      client,
      contentKey,
      createdAt: leftUpdate.createdAt,
      deviceId: currentDeviceId,
      deviceProof: currentDeviceProof,
      keyId,
      label: "first encrypted Brain Dump delta persisted",
      recordId: leftUpdate.id,
      recordType: "brain_dump_update",
      value: leftUpdate,
    });
    ok(leftMutation.version === 1, "first Brain Dump delta is durable");

    if (connected) {
      const signal = await withTimeout(
        signalPromise,
        10_000,
        "The Brain Dump delta broadcast was not received within 10 seconds.",
      );
      ok(
        signal.payload.recordId === leftUpdate.id &&
          signal.payload.recordType === "brain_dump_update" &&
          hasOnlyBroadcastHint(
            signal.payload,
            ["recordId", "recordType"],
            signal.messageId,
          ),
        "Brain Dump broadcast exposes only the expected record hint and protocol ID",
      );
      const latencyMilliseconds = Math.round(
        signal.receivedAt - leftMutationStartedAt,
      );
      ok(
        latencyMilliseconds <= 1_000,
        `encrypted Brain Dump delta reached the active peer in ${latencyMilliseconds} ms`,
      );
      const removalStatus = await peer.removeChannel(channel);
      channel = undefined;
      ok(
        removalStatus === "ok",
        "Brain Dump peer disconnected before the missed broadcast",
      );
    }

    const rightMutation = await applyEncryptedValue({
      client: peer,
      contentKey,
      createdAt: rightUpdate.createdAt,
      deviceId: targetDeviceId,
      deviceProof: targetDeviceProof,
      keyId,
      label: "second-device encrypted Brain Dump delta persisted",
      recordId: rightUpdate.id,
      recordType: "brain_dump_update",
      value: rightUpdate,
    });
    ok(rightMutation.version === 1, "second Brain Dump delta is durable");

    const durableRows = noError(
      await peer
        .from("encrypted_records")
        .select("record_id,record_type,ciphertext,deleted,updated_at")
        .in("record_id", [bulletId, leftUpdate.id, rightUpdate.id])
        .order("record_id", { ascending: true }),
      "Brain Dump peer reconciled durable encrypted rows",
    );
    ok(
      durableRows.length === 3 &&
        durableRows.every((row) => !row.deleted && row.ciphertext),
      "missed Brain Dump broadcast is recoverable from durable state",
    );
    const serializedRows = JSON.stringify(durableRows);
    ok(
      !serializedRows.includes("Plan") &&
        !serializedRows.includes("alpha") &&
        !serializedRows.includes("beta"),
      "durable Brain Dump rows contain no plaintext thought content",
    );

    const recoveredBulletRow = durableRows.find(
      (row) => row.record_id === bulletId,
    );
    const recoveredUpdateRows = durableRows.filter(
      (row) => row.record_type === "brain_dump_update",
    );
    const recoveredBullet = await decryptEncryptedValue({
      contentKey,
      keyId,
      recordId: bulletId,
      recordType: "brain_dump_bullet",
      row: recoveredBulletRow,
    });
    const recoveredUpdates = await Promise.all(
      recoveredUpdateRows.map((row) =>
        decryptEncryptedValue({
          contentKey,
          keyId,
          recordId: row.record_id,
          recordType: "brain_dump_update",
          row,
        }),
      ),
    );
    const leftFirst = mergeBrainDumpUpdates(
      recoveredBullet,
      recoveredUpdates,
    );
    const rightFirst = mergeBrainDumpUpdates(
      recoveredBullet,
      [...recoveredUpdates].reverse(),
    );
    ok(
      leftFirst.text === rightFirst.text &&
        leftFirst.crdtState === rightFirst.crdtState &&
        leftFirst.text.includes("alpha") &&
        leftFirst.text.includes("beta"),
      "two-device Brain Dump deltas converge in either delivery order",
    );

    const incompleteCompaction = await peer.rpc(
      "compact_brain_dump_updates",
      await encryptedCompactionArguments({
        bullet: leftFirst,
        bulletId,
        contentKey,
        createdAt: nextIsoTimestamp(baseTimestamp, 3),
        deviceId: targetDeviceId,
        deviceProof: targetDeviceProof,
        keyId,
        updateIds: [leftUpdate.id],
      }),
    );
    expectedError(
      incompleteCompaction,
      /changed before compaction/i,
      "incomplete Brain Dump compaction set is rejected",
    );

    noError(
      await peer.rpc(
        "compact_brain_dump_updates",
        await encryptedCompactionArguments({
          bullet: leftFirst,
          bulletId,
          contentKey,
          createdAt: nextIsoTimestamp(baseTimestamp, 4),
          deviceId: targetDeviceId,
          deviceProof: targetDeviceProof,
          keyId,
          updateIds: [leftUpdate.id, rightUpdate.id],
        }),
      ),
      "exact encrypted Brain Dump delta set compacted",
    );
    const compactedRows = noError(
      await peer
        .from("encrypted_records")
        .select("record_id,record_type,ciphertext,deleted")
        .in("record_id", [bulletId, leftUpdate.id, rightUpdate.id]),
      "compacted Brain Dump rows loaded",
    );
    const compactedBulletRow = compactedRows.find(
      (row) => row.record_id === bulletId,
    );
    const compactedBullet = await decryptEncryptedValue({
      contentKey,
      keyId,
      recordId: bulletId,
      recordType: "brain_dump_bullet",
      row: compactedBulletRow,
    });
    ok(
      compactedRows.length === 1 &&
        compactedBullet.text === leftFirst.text &&
        compactedBullet.crdtState === leftFirst.crdtState,
      "compaction retains one converged encrypted snapshot",
    );

    const staleUpdate = createBrainDumpEdit({
      baseState: compactedBullet.crdtState,
      bulletId,
      createdAt: nextIsoTimestamp(baseTimestamp, 5),
      insertion: " stale",
      suffix: `stale-${suffix}`,
    });
    const staleMutationId = randomUUID();
    const staleCiphertext = await encryptFields({
      contentKey,
      keyId,
      recordId: staleUpdate.id,
      recordType: "brain_dump_update",
      value: staleUpdate,
    });
    const deletionTimestamp = nextIsoTimestamp(baseTimestamp, 6);
    const [deletionResult, staleResult] = await Promise.all([
      client.rpc("apply_encrypted_mutation", {
        p_base_version: 0,
        p_ciphertext: null,
        p_created_at: deletionTimestamp,
        p_device_id: currentDeviceId,
        p_device_proof: currentDeviceProof,
        p_field_versions: { deleted: deletionTimestamp },
        p_mutation_id: randomUUID(),
        p_operation: "delete",
        p_record_id: bulletId,
        p_record_type: "brain_dump_bullet",
      }),
      peer.rpc("apply_encrypted_mutation", {
        p_base_version: 0,
        p_ciphertext: staleCiphertext,
        p_created_at: staleUpdate.createdAt,
        p_device_id: targetDeviceId,
        p_device_proof: targetDeviceProof,
        p_field_versions: Object.fromEntries(
          Object.keys(staleCiphertext).map((field) => [
            field,
            staleUpdate.createdAt,
          ]),
        ),
        p_mutation_id: staleMutationId,
        p_operation: "upsert",
        p_record_id: staleUpdate.id,
        p_record_type: "brain_dump_update",
      }),
    ]);
    noError(deletionResult, "Brain Dump bullet deletion won the final state");
    if (
      staleResult.error &&
      !/Brain Dump bullet is unavailable/i.test(staleResult.error.message)
    ) {
      throw new Error(
        `The racing stale Brain Dump delta failed unexpectedly: ${staleResult.error.message}`,
      );
    }
    ok(
      true,
      "racing stale Brain Dump delta either precedes deletion or is rejected",
    );

    const deletedRows = noError(
      await client
        .from("encrypted_records")
        .select("record_id,record_type,ciphertext,deleted")
        .in("record_id", [
          bulletId,
          leftUpdate.id,
          rightUpdate.id,
          staleUpdate.id,
        ]),
      "deleted Brain Dump final state loaded",
    );
    const deletedBullet = deletedRows.find(
      (row) => row.record_id === bulletId,
    );
    ok(
      deletedRows.length === 1 &&
        deletedBullet?.deleted === true &&
        Boolean(deletedBullet.ciphertext),
      "delete-versus-update race leaves only the bullet tombstone",
    );
    const residualHistory = noError(
      await client
        .from("encrypted_record_history")
        .select("record_id")
        .eq("record_type", "brain_dump_update")
        .in("record_id", [
          leftUpdate.id,
          rightUpdate.id,
          staleUpdate.id,
        ]),
      "deleted Brain Dump delta history checked",
    );
    ok(
      residualHistory.length === 0,
      "deletion removes identifiable Brain Dump delta history",
    );
  } finally {
    if (channel) {
      await peer.removeChannel(channel).catch(() => undefined);
    }
    await peer.realtime.disconnect().catch(() => undefined);
  }
}

async function applyEncryptedValue({
  client,
  contentKey,
  createdAt,
  deviceId,
  deviceProof,
  keyId,
  label,
  recordId,
  recordType,
  value,
}) {
  const ciphertext = await encryptFields({
    contentKey,
    keyId,
    recordId,
    recordType,
    value,
  });
  const mutationId = randomUUID();
  const version = noError(
    await client.rpc("apply_encrypted_mutation", {
      p_base_version: 0,
      p_ciphertext: ciphertext,
      p_created_at: createdAt,
      p_device_id: deviceId,
      p_device_proof: deviceProof,
      p_field_versions: Object.fromEntries(
        Object.keys(ciphertext).map((field) => [field, createdAt]),
      ),
      p_mutation_id: mutationId,
      p_operation: "upsert",
      p_record_id: recordId,
      p_record_type: recordType,
    }),
    label,
  );
  return { mutationId, version };
}

async function encryptedCompactionArguments({
  bullet,
  bulletId,
  contentKey,
  createdAt,
  deviceId,
  deviceProof,
  keyId,
  updateIds,
}) {
  const ciphertext = await encryptFields({
    contentKey,
    keyId,
    recordId: bulletId,
    recordType: "brain_dump_bullet",
    value: bullet,
  });
  return {
    p_bullet_id: bulletId,
    p_ciphertext: ciphertext,
    p_created_at: createdAt,
    p_device_id: deviceId,
    p_device_proof: deviceProof,
    p_field_versions: Object.fromEntries(
      Object.keys(ciphertext).map((field) => [field, createdAt]),
    ),
    p_mutation_id: randomUUID(),
    p_update_ids: [...updateIds].sort(),
  };
}

async function encryptFields({
  contentKey,
  keyId,
  recordId,
  recordType,
  value,
}) {
  const ciphertext = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    ciphertext[field] = await encryptField({
      contentKey,
      keyId,
      recordId: `${recordId}:${field}`,
      recordType,
      value: { present: true, value: fieldValue },
    });
  }
  return ciphertext;
}

async function encryptField({
  contentKey,
  keyId,
  recordId,
  recordType,
  value,
}) {
  const aad = `organa:record:v1:${recordType}:${recordId}`;
  const iv = randomBytes(12);
  const encrypted = new Uint8Array(
    await webcrypto.subtle.encrypt(
      {
        additionalData: new TextEncoder().encode(aad),
        iv,
        name: "AES-GCM",
        tagLength: 128,
      },
      contentKey,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return {
    aad,
    algorithm: "AES-256-GCM",
    combined: Buffer.concat([iv, encrypted]).toString("base64"),
    keyId,
    version: 1,
  };
}

async function decryptEncryptedValue({
  contentKey,
  keyId,
  recordId,
  recordType,
  row,
}) {
  if (!row?.ciphertext || row.deleted) {
    throw new Error("The encrypted Brain Dump row is unavailable.");
  }
  const value = {};
  for (const [field, envelope] of Object.entries(row.ciphertext)) {
    const fieldValue = await decryptField({
      contentKey,
      envelope,
      keyId,
      recordId: `${recordId}:${field}`,
      recordType,
    });
    if (fieldValue.present) value[field] = fieldValue.value;
  }
  return value;
}

async function decryptField({
  contentKey,
  envelope,
  keyId,
  recordId,
  recordType,
}) {
  const expectedAad = `organa:record:v1:${recordType}:${recordId}`;
  if (
    envelope?.algorithm !== "AES-256-GCM" ||
    envelope?.version !== 1 ||
    envelope?.keyId !== keyId ||
    envelope?.aad !== expectedAad
  ) {
    throw new Error("The encrypted Brain Dump metadata is invalid.");
  }
  const combined = Buffer.from(envelope.combined, "base64");
  if (combined.length < 29) {
    throw new Error("The encrypted Brain Dump payload is invalid.");
  }
  const plaintext = await webcrypto.subtle.decrypt(
    {
      additionalData: new TextEncoder().encode(expectedAad),
      iv: combined.subarray(0, 12),
      name: "AES-GCM",
      tagLength: 128,
    },
    contentKey,
    combined.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function createBrainDumpEdit({
  baseState,
  bulletId,
  createdAt,
  insertion,
  suffix,
}) {
  const document = new Y.Doc();
  Y.applyUpdate(document, decodeBytes(baseState));
  let incrementalUpdate;
  document.on("update", (update) => {
    incrementalUpdate = Uint8Array.from(update);
  });
  const text = document.getText("text");
  text.insert(text.length, insertion);
  if (!incrementalUpdate) {
    throw new Error("The Brain Dump edit did not produce a Yjs update.");
  }
  return {
    bulletId,
    createdAt,
    id: `brain-update:${bulletId}:${suffix}`,
    update: encodeBytes(incrementalUpdate),
  };
}

function mergeBrainDumpUpdates(bullet, updates) {
  const document = new Y.Doc();
  Y.applyUpdate(document, decodeBytes(bullet.crdtState));
  for (const update of updates) {
    Y.applyUpdate(document, decodeBytes(update.update));
  }
  return {
    ...bullet,
    crdtState: encodeBytes(Y.encodeStateAsUpdate(document)),
    text: document.getText("text").toString(),
    updatedAt: updates.reduce(
      (latest, update) =>
        update.createdAt > latest ? update.createdAt : latest,
      bullet.updatedAt,
    ),
  };
}

function encodeBytes(value) {
  return Buffer.from(value).toString("base64");
}

function decodeBytes(value) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function nextIsoTimestamp(timestamp, offsetMilliseconds) {
  return new Date(
    Date.parse(timestamp) + offsetMilliseconds,
  ).toISOString();
}

async function verifyConnectedReminderDeviceSessions({
  client,
  currentDeviceId,
  currentDeviceProof,
  email,
  password,
  targetDeviceId,
  targetDeviceProof,
  userId,
}) {
  const peer = createClient(apiUrl, publishableKey, clientOptions);
  const queuedSignals = [];
  const signalWaiters = [];
  let channel;

  try {
    const authentication = noError(
      await peer.auth.signInWithPassword({ email, password }),
      "live reminder-device session authenticated",
    );
    const refreshToken = authentication?.session?.refresh_token;
    ok(
      typeof refreshToken === "string",
      "live reminder-device refresh session established",
    );
    await peer.realtime.setAuth();

    let resolveSubscription;
    let rejectSubscription;
    const subscriptionPromise = new Promise((resolve, reject) => {
      resolveSubscription = resolve;
      rejectSubscription = reject;
    });
    let subscriptionSettled = false;

    channel = peer
      .channel(`organa:${userId}:devices`, {
        config: { private: true },
      })
      .on("broadcast", { event: "changed" }, ({ meta, payload }) => {
        const signal = {
          messageId: meta?.id,
          payload,
          receivedAt: performance.now(),
        };
        const waiterIndex = signalWaiters.findIndex(
          (waiter) =>
            waiter.deviceId === payload?.deviceId &&
            signal.receivedAt >= waiter.after,
        );
        if (waiterIndex >= 0) {
          const [waiter] = signalWaiters.splice(waiterIndex, 1);
          waiter.resolve(signal);
          return;
        }
        queuedSignals.push(signal);
        if (queuedSignals.length > 20) queuedSignals.shift();
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
            new Error(
              "The private reminder-device channel could not subscribe.",
            ),
          );
        }
      });

    await withTimeout(
      subscriptionPromise,
      15_000,
      "The private reminder-device channel did not subscribe within 15 seconds.",
    );
    ok(true, "private reminder-device channel subscribed");

    await expectDeviceSignals({
      deviceIds: [currentDeviceId, targetDeviceId],
      label: "primary reminder promotion",
      operation: async () =>
        noError(
          await client.rpc("configure_reminder_device", {
            p_current_device_id: currentDeviceId,
            p_current_device_proof: currentDeviceProof,
            p_device_id: targetDeviceId,
            p_make_primary: true,
            p_notifications_enabled: true,
          }),
          "connected target promoted to primary reminder",
        ),
    });
    const promotedDevices = noError(
      await peer
        .from("devices")
        .select("id,primary_reminder,notifications_enabled,revoked_at")
        .in("id", [currentDeviceId, targetDeviceId]),
      "live peer loaded promoted reminder ownership",
    );
    const promotedCurrent = promotedDevices.find(
      (device) => device.id === currentDeviceId,
    );
    const promotedTarget = promotedDevices.find(
      (device) => device.id === targetDeviceId,
    );
    ok(
      promotedTarget?.primary_reminder &&
        promotedTarget.notifications_enabled &&
        !promotedTarget.revoked_at &&
        !promotedCurrent?.primary_reminder &&
        !promotedCurrent?.notifications_enabled,
      "live peer observes atomic primary ownership and quiet demotion",
    );

    await expectDeviceSignals({
      deviceIds: [currentDeviceId, targetDeviceId],
      label: "primary reminder restoration",
      operation: async () =>
        noError(
          await peer.rpc("configure_reminder_device", {
            p_current_device_id: targetDeviceId,
            p_current_device_proof: targetDeviceProof,
            p_device_id: currentDeviceId,
            p_make_primary: true,
            p_notifications_enabled: true,
          }),
          "live target session restored the original primary reminder",
        ),
    });
    const restoredDevices = noError(
      await peer
        .from("devices")
        .select("id,primary_reminder,notifications_enabled,revoked_at")
        .in("id", [currentDeviceId, targetDeviceId]),
      "live peer loaded restored reminder ownership",
    );
    const restoredCurrent = restoredDevices.find(
      (device) => device.id === currentDeviceId,
    );
    const restoredTarget = restoredDevices.find(
      (device) => device.id === targetDeviceId,
    );
    ok(
      restoredCurrent?.primary_reminder &&
        restoredCurrent.notifications_enabled &&
        !restoredCurrent.revoked_at &&
        !restoredTarget?.primary_reminder &&
        !restoredTarget?.notifications_enabled,
      "live target operation restores one primary and a quiet secondary",
    );

    await expectDeviceSignals({
      deviceIds: [targetDeviceId],
      label: "secondary reminder opt-in",
      operation: async () =>
        noError(
          await client.rpc("configure_reminder_device", {
            p_current_device_id: currentDeviceId,
            p_current_device_proof: currentDeviceProof,
            p_device_id: targetDeviceId,
            p_make_primary: false,
            p_notifications_enabled: true,
          }),
          "connected secondary reminders explicitly enabled",
        ),
    });
    const enabledTarget = noError(
      await peer
        .from("devices")
        .select("primary_reminder,notifications_enabled,revoked_at")
        .eq("id", targetDeviceId)
        .single(),
      "live peer loaded secondary reminder opt-in",
    );
    ok(
      !enabledTarget.primary_reminder &&
        enabledTarget.notifications_enabled &&
        !enabledTarget.revoked_at,
      "live peer observes explicit secondary reminder opt-in",
    );

    await expectDeviceSignals({
      deviceIds: [targetDeviceId],
      label: "target device revocation",
      operation: async () =>
        noError(
          await client.rpc("revoke_trusted_device", {
            p_current_device_id: currentDeviceId,
            p_current_device_proof: currentDeviceProof,
            p_target_device_id: targetDeviceId,
          }),
          "connected target device revoked",
        ),
    });
    const revokedTarget = noError(
      await peer
        .from("devices")
        .select("primary_reminder,notifications_enabled,revoked_at")
        .eq("id", targetDeviceId)
        .single(),
      "live target session loaded its revoked device state",
    );
    ok(
      Boolean(revokedTarget.revoked_at) &&
        !revokedTarget.primary_reminder &&
        !revokedTarget.notifications_enabled,
      "live target session observes revocation and reminder removal",
    );
    // Access JWTs remain valid until expiry, so device-proof denial is the
    // immediate revocation boundary; refresh revocation closes the session.
    expectedError(
      await peer.rpc("configure_reminder_device", {
        p_current_device_id: targetDeviceId,
        p_current_device_proof: targetDeviceProof,
        p_device_id: currentDeviceId,
        p_make_primary: false,
        p_notifications_enabled: true,
      }),
      /proof is invalid/i,
      "revoked live device proof loses privileged access",
    );

    noError(
      await client.auth.signOut({ scope: "others" }),
      "revoker invalidated other account refresh sessions",
    );
    const refresh = await peer.auth.refreshSession({
      refresh_token: refreshToken,
    });
    throwIfInterrupted();
    ok(
      Boolean(refresh.error) && !refresh.data.session,
      "revoked live session cannot refresh",
    );
  } finally {
    if (channel) {
      await peer.removeChannel(channel).catch(() => undefined);
    }
    await peer.realtime.disconnect().catch(() => undefined);
  }

  function waitForDeviceSignal(deviceId, after) {
    const queuedIndex = queuedSignals.findIndex(
      (signal) =>
        signal.payload?.deviceId === deviceId &&
        signal.receivedAt >= after,
    );
    if (queuedIndex >= 0) {
      return Promise.resolve(queuedSignals.splice(queuedIndex, 1)[0]);
    }
    return new Promise((resolve) => {
      signalWaiters.push({ after, deviceId, resolve });
    });
  }

  async function expectDeviceSignals({ deviceIds, label, operation }) {
    const expectedDeviceIds = [...new Set(deviceIds)];
    const operationStartedAt = performance.now();
    const signalPromises = expectedDeviceIds.map((deviceId) =>
      waitForDeviceSignal(deviceId, operationStartedAt),
    );
    await operation();
    const signals = await withTimeout(
      Promise.all(signalPromises),
      10_000,
      `The ${label} broadcasts were not received within 10 seconds.`,
    );
    ok(
      signals.every(
        (signal) =>
          expectedDeviceIds.includes(signal.payload?.deviceId) &&
          hasOnlyBroadcastHint(
            signal.payload,
            ["deviceId"],
            signal.messageId,
          ),
      ),
      `${label} broadcasts expose only device identifiers and protocol IDs`,
    );
    const latencyMilliseconds = Math.round(
      Math.max(...signals.map((signal) => signal.receivedAt)) -
        operationStartedAt,
    );
    ok(
      latencyMilliseconds <= 1_000,
      `${label} reached the live peer in ${latencyMilliseconds} ms`,
    );
  }
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
      .on("broadcast", { event: "changed" }, ({ meta, payload }) => {
        if (
          payload?.recordId === realtimeRecordId &&
          payload?.recordType === "task"
        ) {
          resolveSignal({
            messageId: meta?.id,
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
        hasOnlyBroadcastHint(
          signal.payload,
          ["recordId", "recordType"],
          signal.messageId,
        ),
      "Realtime broadcast exposes only the expected record hint and protocol ID",
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
  return isDeepStrictEqual(left, right);
}

function hasOnlyBroadcastHint(payload, applicationKeys, messageId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const actualKeys = Object.keys(payload).sort();
  const expectedKeys = [...applicationKeys].sort();
  if (sameJson(actualKeys, expectedKeys)) return true;

  return (
    sameJson(actualKeys, [...applicationKeys, "id"].sort()) &&
    typeof payload.id === "string" &&
    canonicalUuidPattern.test(payload.id) &&
    payload.id === messageId
  );
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
  await syntheticAccounts.cleanup(cleanupAdmin);
  users.splice(0);
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
      verifyAuthSettings: false,
    };
  }
  if (
    (mode !== "--connected" && mode !== "--connected-backend") ||
    unexpected.length > 0
  ) {
    throw new Error(
      "Usage: node verify-local-supabase.mjs [--connected|--connected-backend [config-path]]",
    );
  }
  return readConnectedEnvironment(configPath, {
    verifyAuthSettings: mode === "--connected",
  });
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

function readConnectedEnvironment(configPath, { verifyAuthSettings }) {
  const config = readConnectedSupabaseConfig(configPath);

  return {
    apiUrl: config.supabaseUrl,
    connected: true,
    label: verifyAuthSettings ? "Connected" : "Connected backend",
    publishableKey: config.publishableKey,
    serviceRoleKey: config.secretKey,
    verifyAuthSettings,
  };
}
