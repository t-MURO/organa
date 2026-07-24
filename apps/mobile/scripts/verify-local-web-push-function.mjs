import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const schedulerSecret = `organa-web-push-${randomUUID()}`;
const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const checks = [];
let createdUser;
let functionProcess;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "organa-web-push-"));
  const envFile = join(temporaryDirectory, "web-push.env");
  await writeFile(
    envFile,
    [
      `WEB_PUSH_SCHEDULER_SECRET=${schedulerSecret}`,
      "WEB_PUSH_VAPID_PUBLIC_KEY=local-test-public-key",
      "WEB_PUSH_VAPID_PRIVATE_KEY=local-test-private-key",
      "WEB_PUSH_VAPID_SUBJECT=mailto:web-push-test@example.test",
      "WEB_PUSH_TEST_MODE=local-only",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  functionProcess = spawn(
    "pnpm",
    [
      "dlx",
      "supabase@latest",
      "functions",
      "serve",
      "dispatch-web-push",
      "--env-file",
      envFile,
    ],
    {
      cwd: repositoryRoot,
      detached: true,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await waitForFunction(functionProcess);
  await verifyEndpointGuards();

  const password = `Organa-${randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({
    email: `web-push-${randomUUID()}@example.test`,
    email_confirm: true,
    password,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Web Push test user creation failed.");
  }
  createdUser = created.data.user;
  ok(true, "Web Push test user created");

  const client = createClient(apiUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  noError(
    await client.auth.signInWithPassword({
      email: createdUser.email,
      password,
    }),
    "Web Push test user authenticated",
  );

  const deviceId = randomUUID();
  const deviceProof = "w".repeat(72);
  const keyId = randomUUID();
  noError(
    await client.rpc("enroll_account_key", {
      p_device_id: deviceId,
      p_device_name: "Push test browser",
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
    "Web Push test device enrolled",
  );

  const subscription = {
    auth: "D".repeat(22),
    endpoint: "https://push.example.test/edge-function",
    expirationTime: null,
    p256dh: "C".repeat(65),
  };
  noError(
    await client.rpc("replace_web_push_schedule", {
      p_current_device_id: deviceId,
      p_current_device_proof: deviceProof,
      p_entries: [
        {
          fireAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
          key: "task:edge-function",
          route: "/focus?taskId=edge-function-task",
        },
      ],
      p_scope: "task:edge-function-task",
      p_subscription: subscription,
    }),
    "one-shot Web Push reminder scheduled",
  );
  noError(
    await admin
      .from("web_push_reminders")
      .update({ fire_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("scope", "task:edge-function-task"),
    "one-shot reminder made due",
  );

  const oneShot = await invokeDispatcher();
  ok(
    oneShot.status === 200 &&
      oneShot.body.processed === 1 &&
      oneShot.body.delivered === 1 &&
      oneShot.body.testMode === true,
    "due one-shot reminder dispatched through the Edge worker",
  );
  const oneShotRows = noError(
    await admin
      .from("web_push_reminders")
      .select("id")
      .eq("scope", "task:edge-function-task"),
    "one-shot reminder completion checked",
  );
  ok(oneShotRows.length === 0, "delivered one-shot reminder is removed");

  noError(
    await client.rpc("replace_web_push_schedule", {
      p_current_device_id: deviceId,
      p_current_device_proof: deviceProof,
      p_entries: [
        {
          fireAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
          key: "check-in:daily",
          repeatLocalTime: "20:00",
          route: "/check-in",
          timeZone: "Europe/Berlin",
        },
      ],
      p_scope: "check-in",
      p_subscription: subscription,
    }),
    "daily Check-In Web Push reminder scheduled",
  );
  noError(
    await admin
      .from("web_push_reminders")
      .update({ fire_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("scope", "check-in"),
    "daily Check-In reminder made due",
  );

  const daily = await invokeDispatcher();
  ok(
    daily.status === 200 &&
      daily.body.processed === 1 &&
      daily.body.delivered === 1,
    "daily Check-In reminder dispatched through the Edge worker",
  );
  const nextDaily = noError(
    await admin
      .from("web_push_reminders")
      .select("fire_at,claimed_at,attempts")
      .eq("scope", "check-in")
      .single(),
    "next daily Check-In reminder loaded",
  );
  const nextDelay = new Date(nextDaily.fire_at).getTime() - Date.now();
  ok(
    nextDaily.claimed_at === null &&
      nextDaily.attempts === 0 &&
      nextDelay > 0 &&
      nextDelay <= 26 * 60 * 60 * 1_000,
    "daily Check-In reminder advances to the next local evening",
  );

  console.log(
    `Local Web Push function verification passed (${checks.length} checks).`,
  );
} finally {
  if (createdUser) {
    await admin.auth.admin.deleteUser(createdUser.id);
  }
  if (functionProcess) {
    await stopFunction(functionProcess);
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function verifyEndpointGuards() {
  const unauthorized = await fetch(
    `${apiUrl}/functions/v1/dispatch-web-push`,
    { method: "POST" },
  );
  ok(unauthorized.status === 401, "Web Push scheduler secret is required");

  const wrongMethod = await fetch(
    `${apiUrl}/functions/v1/dispatch-web-push`,
    {
      headers: { authorization: `Bearer ${schedulerSecret}` },
      method: "GET",
    },
  );
  ok(
    wrongMethod.status === 405 &&
      wrongMethod.headers.get("allow") === "POST",
    "Web Push scheduler accepts POST only",
  );
}

async function invokeDispatcher() {
  const response = await fetch(
    `${apiUrl}/functions/v1/dispatch-web-push`,
    {
      headers: { authorization: `Bearer ${schedulerSecret}` },
      method: "POST",
    },
  );
  return { body: await response.json(), status: response.status };
}

function noError(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  checks.push(label);
  return result.data;
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
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

function waitForFunction(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(
        new Error(`Web Push function did not become ready.\n${output.trim()}`),
      );
    }, 60_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (!output.includes("Serving functions on")) return;
      clearTimeout(timeout);
      child.removeListener("exit", onExit);
      resolve();
    };
    const onExit = (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Web Push function exited with code ${code}.\n${output.trim()}`,
        ),
      );
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

async function stopFunction(child) {
  if (child.exitCode === null) {
    process.kill(-child.pid, "SIGTERM");
    const exited = await waitForExit(child);
    if (!exited && child.exitCode === null) {
      process.kill(-child.pid, "SIGKILL");
      await waitForExit(child);
    }
  }
  child.stdout.destroy();
  child.stderr.destroy();
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}
