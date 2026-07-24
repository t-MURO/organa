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

const schedulerSecret = `organa-deletion-${randomUUID()}`;
const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const checks = [];
let createdUser;
let functionProcess;
let temporaryDirectory;

try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "organa-functions-"));
  const envFile = join(temporaryDirectory, "deletion.env");
  await writeFile(
    envFile,
    `ACCOUNT_DELETION_SCHEDULER_SECRET=${schedulerSecret}\n`,
    { mode: 0o600 },
  );

  functionProcess = spawn(
    "pnpm",
    [
      "dlx",
      "supabase@latest",
      "functions",
      "serve",
      "finalize-account-deletions",
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
    email: `deletion-${randomUUID()}@example.test`,
    email_confirm: true,
    password,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Deletion test user creation failed.");
  }
  createdUser = created.data.user;
  ok(true, "deletion test user created");

  const client = createClient(apiUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  noError(
    await client.auth.signInWithPassword({
      email: createdUser.email,
      password,
    }),
    "deletion test user authenticated",
  );

  const deviceId = randomUUID();
  const deviceProof = "d".repeat(72);
  const keyId = randomUUID();
  noError(
    await client.rpc("enroll_account_key", {
      p_device_id: deviceId,
      p_device_name: "Deletion test browser",
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
    "account key and device enrolled",
  );

  const mutationTime = new Date().toISOString();
  noError(
    await client.rpc("apply_encrypted_mutation", {
      p_base_version: 0,
      p_ciphertext: { title: { combined: "ciphertext" } },
      p_created_at: mutationTime,
      p_device_id: deviceId,
      p_device_proof: deviceProof,
      p_field_versions: { title: mutationTime },
      p_mutation_id: randomUUID(),
      p_operation: "upsert",
      p_record_id: "deletion-test-task",
      p_record_type: "task",
    }),
    "encrypted cloud record created",
  );
  noError(
    await client.rpc("replace_web_push_schedule", {
      p_current_device_id: deviceId,
      p_current_device_proof: deviceProof,
      p_entries: [
        {
          fireAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
          key: "task:deletion",
          route: "/focus?taskId=deletion-test-task",
        },
      ],
      p_scope: "task:deletion-test-task",
      p_subscription: {
        auth: "D".repeat(22),
        endpoint: "https://push.example.test/deletion",
        expirationTime: null,
        p256dh: "C".repeat(65),
      },
    }),
    "Web Push subscription and reminder created",
  );

  const deletionRequest = noError(
    await client.rpc("request_account_deletion", {
      p_device_id: deviceId,
      p_device_proof: deviceProof,
    }),
    "one-hour deletion requested",
  );
  const requestRow = Array.isArray(deletionRequest)
    ? deletionRequest[0]
    : deletionRequest;
  ok(
    new Date(requestRow.execute_after).getTime() -
      new Date(requestRow.requested_at).getTime() >=
      60 * 60 * 1_000,
    "deletion deadline is at least one hour after the request",
  );

  ageDeletionRequest(createdUser.id);
  ok(true, "deletion request aged beyond its deadline");

  const before = accountRowCounts(createdUser.id);
  ok(
    before.users === 1 &&
      before.accountKeys === 1 &&
      before.devices === 1 &&
      before.encryptedRecords === 1 &&
      before.webPushSubscriptions === 1 &&
      before.webPushReminders === 1 &&
      before.sessions >= 1,
    "account, key, device, encrypted content, Web Push state, and session exist before finalization",
  );

  const response = await fetch(
    `${apiUrl}/functions/v1/finalize-account-deletions`,
    {
      headers: { authorization: `Bearer ${schedulerSecret}` },
      method: "POST",
    },
  );
  const result = await response.json();
  ok(
    response.status === 200 &&
      result.processed === 1 &&
      result.deleted === 1 &&
      result.failures.length === 0,
    "due deletion finalized successfully",
  );

  const after = accountRowCounts(createdUser.id);
  ok(
    Object.values(after).every((count) => count === 0),
    "auth user, sessions, device keys, and encrypted cloud rows are removed",
  );

  console.log(
    `Local account-deletion function verification passed (${checks.length} checks).`,
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
    `${apiUrl}/functions/v1/finalize-account-deletions`,
    { method: "POST" },
  );
  ok(unauthorized.status === 401, "scheduler secret is required");

  const wrongMethod = await fetch(
    `${apiUrl}/functions/v1/finalize-account-deletions`,
    {
      headers: { authorization: `Bearer ${schedulerSecret}` },
      method: "GET",
    },
  );
  ok(
    wrongMethod.status === 405 &&
      wrongMethod.headers.get("allow") === "POST",
    "deletion scheduler accepts POST only",
  );
}

function ageDeletionRequest(userId) {
  executeSql(`
    update public.account_deletion_requests
    set requested_at = now() - interval '2 hours',
        execute_after = now() - interval '1 hour'
    where user_id = '${userId}'::uuid;
  `);
}

function accountRowCounts(userId) {
  const output = executeSql(`
    select json_build_object(
      'users', (
        select count(*) from auth.users where id = '${userId}'::uuid
      ),
      'sessions', (
        select count(*) from auth.sessions where user_id = '${userId}'::uuid
      ),
      'accountKeys', (
        select count(*) from public.account_keys
        where user_id = '${userId}'::uuid
      ),
      'devices', (
        select count(*) from public.devices
        where user_id = '${userId}'::uuid
      ),
      'encryptedRecords', (
        select count(*) from public.encrypted_records
        where user_id = '${userId}'::uuid
      ),
      'webPushSubscriptions', (
        select count(*) from public.web_push_subscriptions
        where user_id = '${userId}'::uuid
      ),
      'webPushReminders', (
        select count(*)
        from public.web_push_reminders as reminders
        join public.web_push_subscriptions as subscriptions
          on subscriptions.id = reminders.subscription_id
        where subscriptions.user_id = '${userId}'::uuid
      ),
      'deletionRequests', (
        select count(*) from public.account_deletion_requests
        where user_id = '${userId}'::uuid
      )
    );
  `);
  return JSON.parse(output);
}

function executeSql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_organa-local",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function waitForFunction(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(
        new Error(`Edge Function did not become ready.\n${output.trim()}`),
      );
    }, 30_000);
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
          `Edge Function process exited with code ${code}.\n${output.trim()}`,
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
