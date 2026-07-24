import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliVersion = "2.109.1";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const migrationDirectory = join(repositoryRoot, "supabase", "migrations");
const mode = process.argv[2];
const credentialPath = resolve(
  process.argv[3] ?? join(repositoryRoot, ".organa-self-hosted-db-url"),
);

if (mode !== "plan" && mode !== "apply") {
  fail(
    "Usage: node supabase/self-hosted/apply-organa-migrations.mjs " +
      "[plan|apply] [credential-file]",
  );
}

if (!existsSync(credentialPath)) {
  fail(`Credential file is missing: ${credentialPath}`);
}

const credentialMode = statSync(credentialPath).mode & 0o777;
if (credentialMode !== 0o600 && credentialMode !== 0o400) {
  fail("Credential file must have mode 600 or 400.");
}

const rawCredential = readFileSync(credentialPath, "utf8");
const lines = rawCredential.replace(/\r?\n$/, "").split(/\r?\n/);
if (lines.length !== 1 || !lines[0] || lines[0].trim() !== lines[0]) {
  fail("Credential file must contain exactly one PostgreSQL URL.");
}

let target;
try {
  target = new URL(lines[0]);
} catch {
  fail("Credential file must contain a valid percent-encoded PostgreSQL URL.");
}

if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
  fail("Database URL must use the postgres: or postgresql: scheme.");
}
if (!target.hostname || !target.username || !target.password) {
  fail("Database URL must include a host, username, and password.");
}
if (target.hash) {
  fail("Database URL must not contain a fragment.");
}
for (const unsafeParameter of ["password", "passfile", "service"]) {
  if (target.searchParams.has(unsafeParameter)) {
    fail(`Database URL must not use the ${unsafeParameter} query parameter.`);
  }
}

let password;
let username;
let database;
try {
  password = decodeURIComponent(target.password);
  username = decodeURIComponent(target.username);
  database = decodeURIComponent(target.pathname.replace(/^\//, ""));
} catch {
  fail("Database URL credentials and database name must be percent-encoded.");
}
if (!database || database.includes("/")) {
  fail("Database URL must identify exactly one database.");
}

const migrations = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
  .sort();
if (migrations.length === 0) {
  fail("No Organa migrations were found.");
}

const migrationStatus = spawnSync(
  "git",
  ["status", "--porcelain", "--", "supabase/migrations"],
  { cwd: repositoryRoot, encoding: "utf8" },
);
if (migrationStatus.status !== 0) {
  fail("Unable to inspect the migration worktree.");
}
if (migrationStatus.stdout.trim()) {
  fail("The migration directory has uncommitted changes.");
}

const revisionResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (revisionResult.status !== 0 || !revisionResult.stdout.trim()) {
  fail("Unable to resolve the Organa Git revision.");
}
const revision = revisionResult.stdout.trim();

const temporaryDirectory = mkdtempSync(join(tmpdir(), "organa-pgpass-"));
const passfilePath = join(temporaryDirectory, "pgpass");
const safeTarget = new URL(target);
safeTarget.password = "";
const cleanup = () => {
  rmSync(temporaryDirectory, { force: true, recursive: true });
};
for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    process.kill(process.pid, signal);
  });
}

writeFileSync(
  passfilePath,
  [
    escapePgpass(target.hostname),
    target.port || "5432",
    escapePgpass(database),
    escapePgpass(username),
    escapePgpass(password),
  ].join(":") + "\n",
  { mode: 0o600 },
);
chmodSync(passfilePath, 0o600);
try {
  unlinkSync(credentialPath);
} catch {
  cleanup();
  fail("Unable to remove the one-time credential file.");
}

const childEnvironment = { ...process.env, PGPASSFILE: passfilePath };
delete childEnvironment.DATABASE_URL;
delete childEnvironment.DB_URL;
delete childEnvironment.ORGANA_SELF_HOSTED_DB_URL;
delete childEnvironment.PGPASSWORD;
delete childEnvironment.SUPABASE_DB_PASSWORD;

try {
  console.log(`Organa revision: ${revision}`);
  run(["--version"]);
  run([
    "db",
    "push",
    "--db-url",
    safeTarget.toString(),
    "--dry-run",
  ]);

  if (mode === "plan") {
    console.log(
      `Migration plan completed for ${migrations.length} Organa migrations.`,
    );
    process.exitCode = 0;
  } else {
    run([
      "db",
      "push",
      "--db-url",
      safeTarget.toString(),
      "--yes",
    ]);
    run([
      "db",
      "lint",
      "--db-url",
      safeTarget.toString(),
      "--level",
      "warning",
      "--fail-on",
      "error",
    ]);
    console.log(
      `Applied and linted ${migrations.length} Organa migrations successfully.`,
    );
  }
} catch (error) {
  console.error(
    `ERROR: ${error instanceof Error ? error.message : "Migration helper failed."}`,
  );
  process.exitCode = 1;
} finally {
  cleanup();
}

function run(arguments_) {
  const result = spawnSync(
    "pnpm",
    ["dlx", `supabase@${cliVersion}`, ...arguments_],
    {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: "inherit",
    },
  );
  if (result.error) {
    throw new Error("Unable to start the pinned Supabase CLI.");
  }
  if (result.status !== 0) {
    throw new Error("The pinned Supabase CLI command failed.");
  }
}

function escapePgpass(value) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
