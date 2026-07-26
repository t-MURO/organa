import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { createClient } from "@supabase/supabase-js";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";
import { createSyntheticAccountTracker } from "./synthetic-account-tracker.mjs";

const ONE_HOUR_MS = 60 * 60 * 1_000;
const POLL_INTERVAL_MS = 15_000;
const DEADLINE_POLL_INTERVAL_MS = 1_000;
const DEADLINE_POLL_WINDOW_MS = 30_000;
const PROGRESS_INTERVAL_MS = 5 * 60 * 1_000;
const SCHEDULER_GRACE_MS = 5 * 60 * 1_000;
const EARLY_DELETION_TOLERANCE_MS = 5_000;

const [configPath, ...unexpectedArguments] = process.argv.slice(2);
if (unexpectedArguments.length > 0) {
  throw new Error(
    "Usage: node verify-connected-deletion.mjs [config-path]",
  );
}

const config = readConnectedSupabaseConfig(configPath);
if (!config.allowOneHourDeletionDrill) {
  throw new Error(
    "The connected Supabase config must explicitly allow the one-hour deletion drill.",
  );
}

const interruptionController = new AbortController();
const admin = createClient(config.supabaseUrl, config.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: verificationFetch },
});
const cleanupAdmin = createClient(config.supabaseUrl, config.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: cleanupFetch },
});
const client = createClient(config.supabaseUrl, config.publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: verificationFetch },
});
const syntheticAccounts = createSyntheticAccountTracker({
  emailPrefix: "deletion-live-",
});
const checks = [];
const drillStartedAt = performance.now();
let createdUser;
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
  await runDeletionDrill();
} catch (error) {
  runFailure =
    error instanceof Error
      ? error
      : new Error("The connected deletion drill failed.");
}

let cleanupFailure;
try {
  await cleanupSyntheticUser();
} catch {
  cleanupFailure = new Error(
    "Synthetic account cleanup failed; inspect Auth users with the deletion-live- prefix.",
  );
}

if (interruptedSignal && !runFailure) {
  runFailure = new Error(
    `Connected deletion verification was interrupted by ${interruptedSignal}.`,
  );
}
if (runFailure) {
  if (cleanupFailure) {
    console.error(cleanupFailure.message);
  }
  throw runFailure;
}
if (cleanupFailure) throw cleanupFailure;

async function runDeletionDrill() {
  console.log(
    "Connected one-hour deletion drill started. Keep this process awake and connected.",
  );

  const email = `deletion-live-${randomUUID()}@example.test`;
  const password = `Organa-${randomUUID()}-Aa1!`;
  syntheticAccounts.recordAttempt(email);
  const creation = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  syntheticAccounts.recordCreationResult(email, creation);
  throwIfInterrupted();
  if (creation.error || !creation.data.user) {
    throw new Error(
      "The disposable connected deletion account could not be created.",
    );
  }
  createdUser = creation.data.user;
  checks.push("disposable account created");

  const authentication = noError(
    await client.auth.signInWithPassword({ email, password }),
    "disposable account authenticated",
  );
  const refreshToken = authentication?.session?.refresh_token;
  ok(
    typeof authentication?.session?.access_token === "string" &&
      typeof refreshToken === "string",
    "disposable session established",
  );

  const deviceId = randomUUID();
  const deviceProof = "d".repeat(72);
  const keyId = randomUUID();
  noError(
    await client.rpc("enroll_account_key", {
      p_device_id: deviceId,
      p_device_name: "Connected deletion drill",
      p_device_platform: "web",
      p_device_proof: deviceProof,
      p_key_id: keyId,
      p_recovery_key_envelope: {
        algorithm: "AES-256-GCM",
        combined: "E".repeat(80),
        keyId,
        version: 1,
      },
      p_recovery_proof: "f".repeat(64),
    }),
    "account key and trusted device enrolled",
  );

  const recordId = "deletion-drill-task";
  await applyEncryptedMutation({
    baseVersion: 0,
    client,
    deviceId,
    deviceProof,
    fill: "A",
    keyId,
    label: "encrypted record created",
    recordId,
  });

  const pushSchedule = {
    p_current_device_id: deviceId,
    p_current_device_proof: deviceProof,
    p_entries: [
      {
        fireAt: new Date(Date.now() + 24 * ONE_HOUR_MS).toISOString(),
        key: "task:deletion-drill",
        route: `/focus?taskId=${recordId}`,
      },
    ],
    p_scope: `task:${recordId}`,
    p_subscription: {
      auth: "D".repeat(22),
      endpoint: "https://push.example.test/organa-deletion-drill",
      expirationTime: null,
      p256dh: "C".repeat(65),
    },
  };
  noError(
    await client.rpc("replace_web_push_schedule", pushSchedule),
    "Web Push subscription and reminder created",
  );

  const subscriptionRows = noError(
    await admin
      .from("web_push_subscriptions")
      .select("id")
      .eq("user_id", createdUser.id),
    "Web Push subscription located for cascade evidence",
  );
  ok(
    subscriptionRows.length === 1 &&
      typeof subscriptionRows[0]?.id === "string",
    "exactly one Web Push subscription exists",
  );
  const subscriptionId = subscriptionRows[0].id;

  const pendingDeviceId = randomUUID();
  const pendingDeviceProof = "p".repeat(72);
  const pendingDevicePublicKey = "a".repeat(64);
  const firstRequest = await requestDeletion({
    deviceId,
    deviceProof,
    label: "first one-hour deletion requested",
  });

  expectedError(
    await encryptedMutationResult({
      baseVersion: 1,
      client,
      deviceId,
      deviceProof,
      fill: "B",
      keyId,
      recordId,
    }),
    /read-only while deletion is pending/i,
    "encrypted writes are read-only while deletion is pending",
  );
  expectedError(
    await client.rpc("replace_web_push_schedule", pushSchedule),
    /read-only while deletion is pending/i,
    "Web Push writes are read-only while deletion is pending",
  );
  expectedError(
    await client.rpc("request_device_approval", {
      p_device_id: pendingDeviceId,
      p_device_proof: pendingDeviceProof,
      p_name: "Pending deletion drill device",
      p_platform: "web",
      p_request_public_key: pendingDevicePublicKey,
    }),
    /read-only while deletion is pending/i,
    "device writes are read-only while deletion is pending",
  );

  noError(
    await client.rpc("cancel_account_deletion", {
      p_device_id: deviceId,
      p_device_proof: deviceProof,
    }),
    "first deletion request cancelled",
  );
  const cancelledRequest = noError(
    await client
      .from("account_deletion_requests")
      .select("cancelled_at,completed_at,execute_after,requested_at")
      .single(),
    "cancelled deletion state read",
  );
  ok(
    typeof cancelledRequest.cancelled_at === "string" &&
      cancelledRequest.completed_at === null,
    "cancellation is persisted before the deadline",
  );
  ok(
    Date.parse(cancelledRequest.execute_after) === firstRequest.executeAfterMs,
    "cancellation preserves the original deadline",
  );

  await applyEncryptedMutation({
    baseVersion: 1,
    client,
    deviceId,
    deviceProof,
    fill: "C",
    keyId,
    label: "encrypted writes resume after cancellation",
    recordId,
  });
  noError(
    await client.rpc("request_device_approval", {
      p_device_id: pendingDeviceId,
      p_device_proof: pendingDeviceProof,
      p_name: "Pending deletion drill device",
      p_platform: "web",
      p_request_public_key: pendingDevicePublicKey,
    }),
    "device writes resume after cancellation",
  );

  const secondRequestStartedAt = performance.now();
  const secondRequest = await requestDeletion({
    deviceId,
    deviceProof,
    label: "final one-hour deletion requested",
  });
  const secondRequestFinishedAt = performance.now();
  const requestRoundTripMs =
    secondRequestFinishedAt - secondRequestStartedAt;

  const before = await readCascadeCounts(createdUser.id, subscriptionId);
  ok(
    before.accountKeys === 1 &&
      before.accountDeletionRequests === 1 &&
      before.deviceApprovals === 1 &&
      before.devices === 2 &&
      before.encryptedRecordHistory >= 1 &&
      before.encryptedRecords === 1 &&
      before.syncMutations >= 2 &&
      before.webPushReminders === 1 &&
      before.webPushSubscriptions === 1,
    "all seeded private rows exist before scheduled finalization",
  );

  console.log(
    "The final request is pending; waiting for the real once-per-minute scheduler.",
  );
  await waitForScheduledDeletion({
    deletionDelayMs: secondRequest.delayMs,
    requestFinishedAt: secondRequestFinishedAt,
    requestRoundTripMs,
  });

  const after = await readCascadeCounts(createdUser.id, subscriptionId);
  ok(
    Object.values(after).every((count) => count === 0),
    "scheduled Auth deletion cascades through every private table",
  );

  const refresh = await client.auth.refreshSession({
    refresh_token: refreshToken,
  });
  throwIfInterrupted();
  ok(
    Boolean(refresh.error) && !refresh.data.session,
    "deleted account refresh session is invalid",
  );

  const elapsedMinutes = Math.ceil(
    (performance.now() - drillStartedAt) / 60_000,
  );
  console.log(
    `Connected one-hour deletion verification passed (${checks.length} checks, ${elapsedMinutes} minutes).`,
  );
}

async function requestDeletion({ deviceId, deviceProof, label }) {
  const result = noError(
    await client.rpc("request_account_deletion", {
      p_device_id: deviceId,
      p_device_proof: deviceProof,
    }),
    label,
  );
  const row = Array.isArray(result) ? result[0] : result;
  const requestedAtMs = Date.parse(row?.requested_at);
  const executeAfterMs = Date.parse(row?.execute_after);
  const delayMs = executeAfterMs - requestedAtMs;
  ok(
    Number.isFinite(requestedAtMs) &&
      Number.isFinite(executeAfterMs) &&
      row?.cancelled_at === null &&
      row?.completed_at === null,
    `${label} returned active server state`,
  );
  ok(
    delayMs >= ONE_HOUR_MS && delayMs <= ONE_HOUR_MS + 5_000,
    `${label} has an exact one-hour server deadline`,
  );
  return { delayMs, executeAfterMs };
}

async function applyEncryptedMutation({
  baseVersion,
  client: mutationClient,
  deviceId,
  deviceProof,
  fill,
  keyId,
  label,
  recordId,
}) {
  const data = noError(
    await encryptedMutationResult({
      baseVersion,
      client: mutationClient,
      deviceId,
      deviceProof,
      fill,
      keyId,
      recordId,
    }),
    label,
  );
  ok(
    typeof data === "number" && data === baseVersion + 1,
    `${label} at the expected version`,
  );
}

function encryptedMutationResult({
  baseVersion,
  client: mutationClient,
  deviceId,
  deviceProof,
  fill,
  keyId,
  recordId,
}) {
  const mutationTime = new Date().toISOString();
  return mutationClient.rpc("apply_encrypted_mutation", {
    p_base_version: baseVersion,
    p_ciphertext: {
      title: {
        algorithm: "AES-256-GCM",
        combined: fill.repeat(80),
        keyId,
        version: 1,
      },
    },
    p_created_at: mutationTime,
    p_device_id: deviceId,
    p_device_proof: deviceProof,
    p_field_versions: { title: mutationTime },
    p_mutation_id: randomUUID(),
    p_operation: "upsert",
    p_record_id: recordId,
    p_record_type: "task",
  });
}

async function waitForScheduledDeletion({
  deletionDelayMs,
  requestFinishedAt,
  requestRoundTripMs,
}) {
  const latestFinishAt =
    requestFinishedAt + deletionDelayMs + SCHEDULER_GRACE_MS;
  const earliestValidElapsedMs = Math.max(
    0,
    deletionDelayMs -
      requestRoundTripMs -
      EARLY_DELETION_TOLERANCE_MS,
  );
  let consecutiveLookupFailures = 0;
  let lastConfirmedPresentAt = 0;
  let nextProgressAt = requestFinishedAt + PROGRESS_INTERVAL_MS;
  const earliestValidDeletionAt =
    requestFinishedAt + earliestValidElapsedMs;

  while (performance.now() <= latestFinishAt) {
    const userState = await readAuthUserState(createdUser.id);
    const now = performance.now();
    const elapsedMs = now - requestFinishedAt;

    if (userState === "missing") {
      ok(
        elapsedMs >= earliestValidElapsedMs &&
          lastConfirmedPresentAt >= earliestValidDeletionAt,
        "scheduled deletion does not run before the server deadline",
      );
      checks.push("scheduled finalizer permanently removed the Auth user");
      return;
    }

    if (userState === "unknown") {
      consecutiveLookupFailures += 1;
      if (consecutiveLookupFailures >= 4) {
        throw new Error(
          "Connected Auth user polling failed repeatedly during the deletion window.",
        );
      }
    } else {
      consecutiveLookupFailures = 0;
      lastConfirmedPresentAt = now;
    }

    if (now >= nextProgressAt) {
      const elapsedMinutes = Math.floor(elapsedMs / 60_000);
      console.log(
        `Connected deletion drill is still waiting (${elapsedMinutes} minutes elapsed).`,
      );
      nextProgressAt = now + PROGRESS_INTERVAL_MS;
    }

    const nearDeadline =
      now >= earliestValidDeletionAt - DEADLINE_POLL_WINDOW_MS &&
      now <= earliestValidDeletionAt + EARLY_DELETION_TOLERANCE_MS;
    await wait(
      Math.min(
        nearDeadline ? DEADLINE_POLL_INTERVAL_MS : POLL_INTERVAL_MS,
        Math.max(0, latestFinishAt - now),
      ),
    );
  }

  throw new Error(
    "The scheduled finalizer did not remove the disposable account within five minutes after its deadline.",
  );
}

async function readAuthUserState(userId) {
  let result;
  try {
    result = await admin.auth.admin.getUserById(userId);
  } catch {
    throwIfInterrupted();
    return "unknown";
  }
  throwIfInterrupted();
  if (result.data.user) return "present";
  if (isMissingUserError(result.error)) return "missing";
  return "unknown";
}

function isMissingUserError(error) {
  if (!error) return true;
  return (
    error.status === 404 ||
    error.code === "user_not_found" ||
    /not found|does not exist/i.test(error.message ?? "")
  );
}

async function readCascadeCounts(userId, subscriptionId) {
  const [
    accountKeys,
    accountDeletionRequests,
    deviceApprovals,
    devices,
    encryptedRecordHistory,
    encryptedRecords,
    syncMutations,
    webPushReminders,
    webPushSubscriptions,
  ] = await Promise.all([
    countRows("account_keys", "user_id", userId),
    countRows("account_deletion_requests", "user_id", userId),
    countRows("device_approvals", "user_id", userId),
    countRows("devices", "user_id", userId),
    countRows("encrypted_record_history", "user_id", userId),
    countRows("encrypted_records", "user_id", userId),
    countRows("sync_mutations", "user_id", userId),
    countRows("web_push_reminders", "subscription_id", subscriptionId),
    countRows("web_push_subscriptions", "user_id", userId),
  ]);

  return {
    accountDeletionRequests,
    accountKeys,
    deviceApprovals,
    devices,
    encryptedRecordHistory,
    encryptedRecords,
    syncMutations,
    webPushReminders,
    webPushSubscriptions,
  };
}

async function countRows(table, column, value) {
  const result = await admin
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq(column, value);
  throwIfInterrupted();
  if (result.error || typeof result.count !== "number") {
    throw new Error(
      "Connected cascade evidence could not be read with the operator key.",
    );
  }
  return result.count;
}

async function cleanupSyntheticUser() {
  await syntheticAccounts.cleanup(cleanupAdmin);
}

function ok(condition, label) {
  throwIfInterrupted();
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

function noError(result, label) {
  throwIfInterrupted();
  if (result.error) {
    throw new Error(`${label} failed against connected Supabase.`);
  }
  checks.push(label);
  return result.data;
}

function expectedError(result, pattern, label) {
  throwIfInterrupted();
  ok(
    Boolean(result.error && pattern.test(result.error.message ?? "")),
    label,
  );
}

function throwIfInterrupted() {
  if (interruptedSignal) {
    throw new Error(
      `Connected deletion verification interrupted by ${interruptedSignal}; cleaning up the disposable account.`,
    );
  }
}

function wait(milliseconds) {
  return new Promise((resolve, reject) => {
    const signal = interruptionController.signal;
    if (signal.aborted) {
      reject(new Error("Connected deletion verification interrupted."));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Connected deletion verification interrupted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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
