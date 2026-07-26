import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const templatePath = resolve(
  repositoryRoot,
  ".organa-release-evidence.example.json",
);
const outputPath = resolve(repositoryRoot, ".organa-release-evidence.json");
const appConfigPath = resolve(repositoryRoot, "apps/mobile/app.json");

try {
  initializeReleaseEvidence();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "ERROR: release evidence initialization failed",
  );
  process.exitCode = 1;
}

function initializeReleaseEvidence() {
  if (process.argv.length !== 2) {
    fail("usage: node scripts/initialize-release-evidence.mjs");
  }
  requireCleanCommit();
  requireMissingOutput();

  const evidence = readJson(templatePath, "release evidence template");
  const appConfig = readJson(appConfigPath, "Expo app config");
  const projectId = appConfig?.expo?.extra?.eas?.projectId;
  if (!isUuid(projectId)) {
    fail("apps/mobile/app.json does not contain a valid EAS project ID");
  }

  evidence.organaCommit = readCommit();
  evidence.easProjectId = projectId;
  writePrivateOutput(evidence);

  console.log(
    "Private release evidence scaffold created with mode 600.",
  );
  console.log(
    "Only the clean source commit and EAS project link were populated.",
  );
  console.log(
    "Replace each remaining placeholder only after direct production evidence exists.",
  );
}

function requireCleanCommit() {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 5_000,
  });
  if (status.trim()) {
    fail("commit or stash every source change before initializing evidence");
  }
}

function requireMissingOutput() {
  try {
    lstatSync(outputPath);
    fail(
      ".organa-release-evidence.json already exists; refusing to overwrite it",
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function writePrivateOutput(evidence) {
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  let descriptor;
  try {
    descriptor = openSync(
      outputPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    writeFileSync(descriptor, serialized, "utf8");
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
    fail("the private release evidence scaffold could not be written safely");
  }
}

function readJson(path, label) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    fail(`${label} is missing or unreadable`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail(`${label} must be a regular file`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function readCommit() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 5_000,
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    fail("the current Git revision is invalid");
  }
  return commit;
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function fail(message) {
  throw new Error(`ERROR: ${message}`);
}
