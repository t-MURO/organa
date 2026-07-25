import {
  createECDH,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { performance } from "node:perf_hooks";

import { createClient } from "@supabase/supabase-js";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";
import { createSyntheticAccountTracker } from "./synthetic-account-tracker.mjs";

const POLL_INTERVAL_MS = 5_000;
const PROGRESS_INTERVAL_MS = 60_000;
const SCHEDULE_LEAD_MS = 15_000;
const SCHEDULER_WAIT_MS = 3 * 60 * 1_000;
const RETRY_DELAY_MS = 5 * 60 * 1_000;
const RETRY_TOLERANCE_MS = 10_000;

const [configPath, ...unexpectedArguments] = process.argv.slice(2);
if (unexpectedArguments.length > 0) {
  throw new Error(
    "Usage: node verify-connected-web-push.mjs [config-path]",
  );
}

const config = readConnectedSupabaseConfig(configPath);
if (!config.allowWebPushSchedulerDrill) {
  throw new Error(
    "The connected Supabase config must explicitly allow the Web Push scheduler drill.",
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
  emailPrefix: "web-push-live-",
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
  await runWebPushSchedulerDrill();
} catch (error) {
  runFailure =
    error instanceof Error
      ? error
      : new Error("The connected Web Push scheduler drill failed.");
}

let cleanupFailure;
try {
  await cleanupSyntheticUser();
} catch {
  cleanupFailure = new Error(
    "Synthetic account cleanup failed; inspect Auth users with the web-push-live- prefix.",
  );
}

if (interruptedSignal && !runFailure) {
  runFailure = new Error(
    `Connected Web Push verification was interrupted by ${interruptedSignal}.`,
  );
}
if (runFailure) {
  if (cleanupFailure) console.error(cleanupFailure.message);
  throw runFailure;
}
if (cleanupFailure) throw cleanupFailure;

const elapsedSeconds = Math.ceil(
  (performance.now() - drillStartedAt) / 1_000,
);
console.log(
  `Connected Web Push scheduler verification passed (${checks.length} checks, ${elapsedSeconds} seconds).`,
);

async function runWebPushSchedulerDrill() {
  console.log(
    "Connected Web Push scheduler drill started. Waiting for the real cron invocation.",
  );

  const email = `web-push-live-${randomUUID()}@example.test`;
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
      "The disposable connected Web Push account could not be created.",
    );
  }
  createdUser = creation.data.user;
  checks.push("disposable Web Push account created");

  noError(
    await client.auth.signInWithPassword({ email, password }),
    "disposable Web Push account authenticated",
  );

  const deviceId = randomUUID();
  const deviceProof = "w".repeat(72);
  const keyId = randomUUID();
  noError(
    await client.rpc("enroll_account_key", {
      p_device_id: deviceId,
      p_device_name: "Connected Web Push scheduler drill",
      p_device_platform: "web",
      p_device_proof: deviceProof,
      p_key_id: keyId,
      p_recovery_key_envelope: {
        algorithm: "AES-256-GCM",
        combined: "P".repeat(80),
        keyId,
        version: 1,
      },
      p_recovery_proof: "e".repeat(64),
    }),
    "Web Push drill device enrolled",
  );

  const subscriptionKey = createECDH("prime256v1");
  subscriptionKey.generateKeys();
  const scheduledFireAt = new Date(
    Date.now() + SCHEDULE_LEAD_MS,
  ).toISOString();
  noError(
    await client.rpc("replace_web_push_schedule", {
      p_current_device_id: deviceId,
      p_current_device_proof: deviceProof,
      p_entries: [
        {
          fireAt: scheduledFireAt,
          key: "task:scheduler-drill",
          route: "/focus?taskId=web-push-scheduler-drill",
        },
      ],
      p_scope: "task:web-push-scheduler-drill",
      p_subscription: {
        auth: randomBytes(16).toString("base64url"),
        endpoint: "https://push.invalid/organa-web-push-drill",
        expirationTime: null,
        p256dh: subscriptionKey
          .getPublicKey()
          .toString("base64url"),
      },
    }),
    "content-free Web Push retry probe scheduled",
  );

  const subscription = noError(
    await admin
      .from("web_push_subscriptions")
      .select("id")
      .eq("user_id", createdUser.id)
      .eq("device_id", deviceId)
      .single(),
    "synthetic Web Push subscription located",
  );
  const reminder = noError(
    await admin
      .from("web_push_reminders")
      .select(
        "id,attempts,claimed_at,fire_at,last_error_at,reminder_key,route,scope",
      )
      .eq("subscription_id", subscription.id)
      .eq("scope", "task:web-push-scheduler-drill")
      .single(),
    "synthetic Web Push reminder located",
  );
  ok(
    reminder.attempts === 0 &&
      reminder.claimed_at === null &&
      reminder.last_error_at === null &&
      reminder.reminder_key === "task:scheduler-drill" &&
      reminder.route === "/focus?taskId=web-push-scheduler-drill" &&
      Date.parse(reminder.fire_at) === Date.parse(scheduledFireAt),
    "scheduler probe starts unclaimed with content-free routing metadata",
  );

  await waitForRetryState(reminder.id, Date.parse(scheduledFireAt));

  const retainedSubscription = noError(
    await admin
      .from("web_push_subscriptions")
      .select("id")
      .eq("id", subscription.id)
      .maybeSingle(),
    "retrying Web Push subscription checked",
  );
  ok(
    retainedSubscription?.id === subscription.id,
    "transient delivery failure retains the subscription",
  );
}

async function waitForRetryState(reminderId, fireAtMs) {
  const finishAt = performance.now() + SCHEDULER_WAIT_MS;
  let nextProgressAt = performance.now() + PROGRESS_INTERVAL_MS;

  while (performance.now() <= finishAt) {
    const row = noCheckError(
      await admin
        .from("web_push_reminders")
        .select(
          "attempts,claimed_at,fire_at,last_error_at",
        )
        .eq("id", reminderId)
        .maybeSingle(),
      "Connected Web Push retry state could not be read.",
    );
    if (!row) {
      throw new Error(
        "The synthetic reminder disappeared instead of entering retry state; verify the connected function is not using local test mode.",
      );
    }

    if (
      row.attempts >= 1 &&
      row.claimed_at === null &&
      typeof row.last_error_at === "string"
    ) {
      const lastErrorAtMs = Date.parse(row.last_error_at);
      const retryAtMs = Date.parse(row.fire_at);
      ok(
        Number.isFinite(lastErrorAtMs) &&
          Number.isFinite(retryAtMs) &&
          lastErrorAtMs >= fireAtMs - RETRY_TOLERANCE_MS,
        "real dispatcher records a post-due delivery failure",
      );
      ok(
        row.attempts === 1 &&
          retryAtMs - lastErrorAtMs >=
            RETRY_DELAY_MS - RETRY_TOLERANCE_MS &&
          retryAtMs - lastErrorAtMs <=
            RETRY_DELAY_MS + RETRY_TOLERANCE_MS,
        "real dispatcher clears the claim and applies one five-minute retry",
      );
      return;
    }

    const now = performance.now();
    if (now >= nextProgressAt) {
      const elapsedSeconds = Math.floor(
        (now - drillStartedAt) / 1_000,
      );
      console.log(
        `Connected Web Push scheduler drill is still waiting (${elapsedSeconds} seconds elapsed).`,
      );
      nextProgressAt = now + PROGRESS_INTERVAL_MS;
    }
    await wait(
      Math.min(POLL_INTERVAL_MS, Math.max(0, finishAt - now)),
    );
  }

  throw new Error(
    [
      "The once-per-minute Web Push scheduler did not produce retry evidence within three minutes.",
      "Verify cron, VAPID configuration, and that WEB_PUSH_ALLOWED_HOSTS includes push.invalid.",
    ].join(" "),
  );
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

function noCheckError(result, message) {
  throwIfInterrupted();
  if (result.error) throw new Error(message);
  return result.data;
}

function throwIfInterrupted() {
  if (interruptedSignal) {
    throw new Error(
      `Connected Web Push verification interrupted by ${interruptedSignal}; cleaning up the disposable account.`,
    );
  }
}

function wait(milliseconds) {
  return new Promise((resolve, reject) => {
    const signal = interruptionController.signal;
    if (signal.aborted) {
      reject(new Error("Connected Web Push verification interrupted."));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Connected Web Push verification interrupted."));
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
