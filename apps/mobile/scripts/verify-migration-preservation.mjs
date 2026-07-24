import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const migrationRoot = new URL("../../../supabase/migrations/", import.meta.url);
const baselineMigration = "20260723190000_organa_encrypted_sync.sql";
const migrations = readdirSync(migrationRoot)
  .filter((fileName) => /^\d{14}_.+\.sql$/.test(fileName))
  .sort();
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const schema = `organa_upgrade_${suffix}`;
const realtimePolicy = `organa_upgrade_broadcast_${suffix}`;
const environment = readLocalEnvironment();
const databaseContainer = findDatabaseContainer(environment.DB_URL);
const admin = createClient(
  environment.API_URL,
  environment.SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const checks = [];
let user;

try {
  ok(
    migrations.length >= 5 &&
      migrations[0] === baselineMigration &&
      migrations.every((migration) =>
        readFileSync(new URL(migration, migrationRoot), "utf8").trim(),
      ),
    "the baseline and every ordered migration source are available",
  );

  const created = await admin.auth.admin.createUser({
    email: `migration-${suffix}@example.test`,
    email_confirm: true,
    password: `Organa-${randomUUID()}-Aa1!`,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Migration test user creation failed.");
  }
  user = created.data.user;

  runSql(`create schema ${schema};`);
  runSql(isolateMigration(migrations[0]));

  const deviceId = randomUUID();
  const keyId = randomUUID();
  const mutationId = randomUUID();
  runSql(seedSql(user.id, deviceId, keyId, mutationId));

  const before = snapshot();
  ok(
    before.includes("synthetic-ciphertext-marker"),
    "the baseline contains encrypted account and content rows",
  );

  for (const migration of migrations.slice(1)) {
    runSql(isolateMigration(migration));
  }

  const after = snapshot();
  ok(after === before, "all pre-existing rows remain byte-for-byte unchanged");

  const objectState = runSql(
    `
      select concat_ws('|',
        to_regclass('${schema}.device_approvals') is not null,
        to_regclass('${schema}.web_push_subscriptions') is not null,
        to_regclass('${schema}.web_push_reminders') is not null,
        (
          select count(*) = 3
          from pg_class
          where relnamespace = '${schema}'::regnamespace
            and relname in (
              'device_approvals',
              'web_push_subscriptions',
              'web_push_reminders'
            )
            and relrowsecurity
        )
      );
    `,
  );
  ok(
    objectState === "t|t|t|t",
    "later protected tables exist with row-level security enabled",
  );

  const reminderFunction = runSql(
    `
      select pg_get_functiondef(
        '${schema}.configure_reminder_device(uuid,text,uuid,boolean,boolean)'::regprocedure
      );
    `,
  );
  ok(
    reminderFunction.includes("notifications_enabled = false"),
    "the final reminder-device replacement function is installed",
  );

  const webPushFunctions = Number(
    runSql(
      `
        select count(*)
        from pg_proc
        where pronamespace = '${schema}'::regnamespace
          and proname in (
            'replace_web_push_schedule',
            'remove_current_web_push_subscription',
            'claim_due_web_push_reminders'
          );
      `,
    ),
  );
  ok(
    webPushFunctions === 3,
    "all Web Push scheduling functions are installed",
  );

  console.log(
    `Migration preservation verification passed (${checks.length} checks).`,
  );
} finally {
  try {
    runSql(
      `
        drop policy if exists ${realtimePolicy} on realtime.messages;
        drop schema if exists ${schema} cascade;
      `,
    );
  } finally {
    if (user) {
      const deleted = await admin.auth.admin.deleteUser(user.id);
      if (deleted.error) throw deleted.error;
    }
  }
}

function isolateMigration(fileName) {
  return readFileSync(new URL(fileName, migrationRoot), "utf8")
    .replaceAll("public.", `${schema}.`)
    .replace(
      "create policy organa_user_receives_own_broadcasts",
      `create policy ${realtimePolicy}`,
    );
}

function seedSql(userId, deviceId, keyId, mutationId) {
  const timestamp = "2026-07-23T20:00:00.000Z";
  const ciphertext = JSON.stringify({
    algorithm: "AES-256-GCM",
    combined: "synthetic-ciphertext-marker",
    version: 1,
  });
  const fieldVersions = JSON.stringify({
    title: { at: timestamp, by: deviceId },
  });

  return `
    set session_replication_role = replica;

    insert into ${schema}.account_keys (
      user_id,
      key_id,
      recovery_key_envelope,
      recovery_proof_hash,
      created_at,
      updated_at
    ) values (
      '${userId}',
      '${keyId}',
      '${ciphertext}'::jsonb,
      '${"a".repeat(64)}',
      '${timestamp}',
      '${timestamp}'
    );

    insert into ${schema}.devices (
      id,
      user_id,
      name,
      platform,
      device_proof_hash,
      trusted_at,
      primary_reminder,
      notifications_enabled,
      created_at,
      last_seen_at
    ) values (
      '${deviceId}',
      '${userId}',
      'Synthetic trusted device',
      'web',
      '${"b".repeat(64)}',
      '${timestamp}',
      true,
      true,
      '${timestamp}',
      '${timestamp}'
    );

    insert into ${schema}.encrypted_records (
      user_id,
      record_type,
      record_id,
      ciphertext,
      field_versions,
      version,
      deleted,
      updated_by,
      updated_at
    ) values (
      '${userId}',
      'task',
      'preserved-task',
      '${ciphertext}'::jsonb,
      '${fieldVersions}'::jsonb,
      1,
      false,
      '${deviceId}',
      '${timestamp}'
    );

    insert into ${schema}.encrypted_record_history (
      user_id,
      record_type,
      record_id,
      version,
      ciphertext,
      field_versions,
      deleted,
      recorded_at
    ) values (
      '${userId}',
      'task',
      'preserved-task',
      1,
      '${ciphertext}'::jsonb,
      '${fieldVersions}'::jsonb,
      false,
      '${timestamp}'
    );

    insert into ${schema}.sync_mutations (
      id,
      user_id,
      device_id,
      record_type,
      record_id,
      operation,
      ciphertext,
      field_versions,
      base_version,
      applied_version,
      created_at,
      applied_at
    ) values (
      '${mutationId}',
      '${userId}',
      '${deviceId}',
      'task',
      'preserved-task',
      'upsert',
      '${ciphertext}'::jsonb,
      '${fieldVersions}'::jsonb,
      0,
      1,
      '${timestamp}',
      '${timestamp}'
    );

    insert into ${schema}.account_deletion_requests (
      user_id,
      requested_at,
      execute_after,
      cancelled_at
    ) values (
      '${userId}',
      '${timestamp}',
      '2026-07-23T21:00:00.000Z',
      '2026-07-23T20:30:00.000Z'
    );

    set session_replication_role = origin;
  `;
}

function snapshot() {
  return runSql(`
    select jsonb_build_object(
      'accountKeys', (
        select jsonb_agg(to_jsonb(rows) order by user_id)
        from ${schema}.account_keys as rows
      ),
      'devices', (
        select jsonb_agg(to_jsonb(rows) order by id)
        from ${schema}.devices as rows
      ),
      'records', (
        select jsonb_agg(to_jsonb(rows) order by record_type, record_id)
        from ${schema}.encrypted_records as rows
      ),
      'history', (
        select jsonb_agg(to_jsonb(rows) order by record_type, record_id, version)
        from ${schema}.encrypted_record_history as rows
      ),
      'mutations', (
        select jsonb_agg(to_jsonb(rows) order by id)
        from ${schema}.sync_mutations as rows
      ),
      'deletionRequests', (
        select jsonb_agg(to_jsonb(rows) order by user_id)
        from ${schema}.account_deletion_requests as rows
      )
    )::text;
  `);
}

function runSql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      databaseContainer,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    {
      encoding: "utf8",
      input: `set client_min_messages = warning;\n${sql}`,
      maxBuffer: 16 * 1024 * 1024,
    },
  ).trim();
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

function findDatabaseContainer(databaseUrl) {
  if (!databaseUrl) throw new Error("The local database URL is unavailable.");
  const port = new URL(databaseUrl).port;
  const containers = execFileSync(
    "docker",
    ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((name) => name.startsWith("supabase_db_"));
  if (containers.length !== 1) {
    throw new Error("The local Supabase database container is unavailable.");
  }
  return containers[0];
}

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}
