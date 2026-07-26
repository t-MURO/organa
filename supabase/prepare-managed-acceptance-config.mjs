import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cliVersion = "2.109.1";
const options = parseArguments(process.argv.slice(2));
const projectRef = requireProjectRef(options.projectRef);
const outputPath = resolve(
  repositoryRoot,
  options.output ?? ".organa-connected-supabase.json",
);
const relativeOutputPath = relative(repositoryRoot, outputPath);

if (!options.allowSyntheticAccountCreationAndDeletion) {
  fail(
    "explicit synthetic account creation and deletion consent is required",
  );
}
if (
  !relativeOutputPath ||
  isAbsolute(relativeOutputPath) ||
  relativeOutputPath === ".." ||
  relativeOutputPath.startsWith(`..${sep}`)
) {
  fail("the output must stay inside the Organa repository");
}
requireLinkedProject(projectRef);
requireNewPrivateOutput(outputPath);

const migrationVersion = readAndVerifyRemoteMigrations();
const keys = readModernApiKeys(projectRef);
const config = {
  allowOneHourDeletionDrill: false,
  allowSyntheticAccountCreationAndDeletion: true,
  allowWebPushSchedulerDrill: false,
  deployment: {
    migrationVersion,
    projectRef,
    type: "managed",
  },
  publishableKey: keys.publishableKey,
  purpose: "organa-controlled-beta-test",
  secretKey: keys.secretKey,
  supabaseUrl: `https://${projectRef}.supabase.co`,
};

let descriptor;
try {
  descriptor = openSync(
    outputPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  writeFileSync(descriptor, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  closeSync(descriptor);
  descriptor = undefined;
  chmodSync(outputPath, 0o600);
} catch {
  if (descriptor !== undefined) closeSync(descriptor);
  try {
    unlinkSync(outputPath);
  } catch {
    // The output may not have been created.
  }
  fail("the private connected config could not be written safely");
}

console.log(
  "Private managed connected-acceptance config written with mode 600.",
);

function readAndVerifyRemoteMigrations() {
  const response = runSupabaseJson([
    "db",
    "query",
    "--linked",
    "--output",
    "json",
    "select version::text as version from supabase_migrations.schema_migrations order by version;",
  ]);
  const remoteVersions = response?.rows?.map((row) => row?.version);
  const localVersions = readdirSync(
    resolve(repositoryRoot, "supabase/migrations"),
  )
    .map((file) => /^(\d{14})_.+\.sql$/.exec(file)?.[1])
    .filter(Boolean)
    .sort();
  if (
    localVersions.length === 0 ||
    !Array.isArray(remoteVersions) ||
    remoteVersions.length !== localVersions.length ||
    remoteVersions.some(
      (version, index) =>
        !/^\d{14}$/.test(version ?? "") ||
        version !== localVersions[index],
    )
  ) {
    fail("the linked project migration list does not match the repository");
  }
  return localVersions.at(-1);
}

function readModernApiKeys(ref) {
  const response = runSupabaseJson([
    "projects",
    "api-keys",
    "--project-ref",
    ref,
    "--reveal",
    "--output",
    "json",
  ]);
  if (!Array.isArray(response)) {
    fail("the managed project API-key response was invalid");
  }
  const publishable = response.filter(
    (key) =>
      key?.type === "publishable" &&
      typeof key.api_key === "string" &&
      key.api_key.startsWith("sb_publishable_"),
  );
  const secret = response.filter(
    (key) =>
      key?.type === "secret" &&
      typeof key.api_key === "string" &&
      key.api_key.startsWith("sb_secret_"),
  );
  if (publishable.length !== 1 || secret.length !== 1) {
    fail(
      "the project must expose exactly one modern publishable and secret key",
    );
  }
  return {
    publishableKey: publishable[0].api_key,
    secretKey: secret[0].api_key,
  };
}

function runSupabaseJson(argumentsList) {
  let raw;
  try {
    raw = execFileSync(
      "npx",
      ["--yes", `supabase@${cliVersion}`, ...argumentsList],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      },
    );
  } catch {
    fail("the pinned Supabase CLI command failed");
  }
  try {
    return JSON.parse(raw);
  } catch {
    fail("the pinned Supabase CLI returned invalid JSON");
  }
}

function requireLinkedProject(ref) {
  const linkPath = resolve(repositoryRoot, "supabase/.temp/project-ref");
  let stats;
  let linkedRef;
  try {
    stats = lstatSync(linkPath);
    linkedRef = readFileSync(linkPath, "utf8").trim();
  } catch {
    fail("link the managed project with the Supabase CLI first");
  }
  if (!stats.isFile() || stats.isSymbolicLink() || linkedRef !== ref) {
    fail("the linked Supabase project does not match --project-ref");
  }
}

function requireNewPrivateOutput(path) {
  try {
    lstatSync(path);
    fail("the output already exists; refusing to overwrite it");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    const parent = lstatSync(dirname(path));
    if (!parent.isDirectory() || parent.isSymbolicLink()) {
      fail("the output directory must be a real directory");
    }
  } catch {
    fail("the output directory is unavailable");
  }
}

function requireProjectRef(value) {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value)) {
    fail("--project-ref must be a 20-character lowercase Supabase project ref");
  }
  return value;
}

function parseArguments(argumentsList) {
  const parsed = {
    allowSyntheticAccountCreationAndDeletion: false,
    output: undefined,
    projectRef: undefined,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--" && index === 0) {
      continue;
    } else if (argument === "--project-ref") {
      parsed.projectRef = requireValue(argumentsList, ++index, argument);
    } else if (argument === "--output") {
      parsed.output = requireValue(argumentsList, ++index, argument);
    } else if (
      argument === "--allow-synthetic-account-creation-and-deletion"
    ) {
      parsed.allowSyntheticAccountCreationAndDeletion = true;
    } else {
      usage();
    }
  }
  return parsed;
}

function requireValue(argumentsList, index, option) {
  const value = argumentsList[index];
  if (!value || value.startsWith("-") || /[\r\n]/.test(value)) usage();
  return value;
}

function usage() {
  fail(
    "usage: node supabase/prepare-managed-acceptance-config.mjs --project-ref REF --allow-synthetic-account-creation-and-deletion [--output PATH]",
  );
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
