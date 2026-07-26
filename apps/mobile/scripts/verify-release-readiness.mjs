import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";
import {
  supabaseDeploymentsMatch,
  validateSupabaseDeployment,
} from "./supabase-deployment.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const [manifestArgument, ...unexpectedArguments] = process.argv.slice(2);
if (unexpectedArguments.length > 0) {
  throw new Error(
    "Usage: node verify-release-readiness.mjs [release-evidence-path]",
  );
}

const manifestPath = resolve(
  repositoryRoot,
  manifestArgument ?? ".organa-release-evidence.json",
);
const results = [];
const commit = readCommit();
const clean = readGitStatus().trim().length === 0;
record(
  "Source commit",
  clean,
  clean
    ? commit
    : "Commit or stash every source change before recording release evidence.",
);

const appConfig = readJson(
  resolve(repositoryRoot, "apps/mobile/app.json"),
  "Expo app config",
);
const linkedProjectId = appConfig?.expo?.extra?.eas?.projectId;
record(
  "EAS project link",
  isUuid(linkedProjectId),
  isUuid(linkedProjectId)
    ? "opaque project ID is configured"
    : "Run `npx eas-cli@21.2.0 init` from apps/mobile and commit the generated project ID.",
);

let connectedConfig;
try {
  connectedConfig = readConnectedSupabaseConfig(
    ".organa-connected-supabase.json",
  );
  record("Connected operator config", true, "private config is valid");
} catch (error) {
  record(
    "Connected operator config",
    false,
    error instanceof Error ? error.message : "Private config is invalid.",
  );
}

let releaseEvidence;
let releaseEvidenceValid = false;
try {
  releaseEvidence = readPrivateJson(manifestPath, "Release evidence manifest");
  const errors = validateReleaseEvidence(releaseEvidence, {
    commit,
    linkedProjectId,
  });
  releaseEvidenceValid = errors.length === 0;
  record(
    "Production evidence manifest",
    releaseEvidenceValid,
    releaseEvidenceValid
      ? "all required production evidence fields are present"
      : errors,
  );
} catch (error) {
  record(
    "Production evidence manifest",
    false,
    `${
      error instanceof Error ? error.message : "Manifest is invalid."
    } Run \`pnpm initialize:release:evidence\` from a clean commit to create the private scaffold.`,
  );
}

if (connectedConfig && releaseEvidenceValid) {
  const inputsMatch =
    connectedConfig.supabaseUrl === releaseEvidence.backend.origin &&
    supabaseDeploymentsMatch(
      connectedConfig.deployment,
      releaseEvidence.backend.deployment,
    );
  record(
    "Backend evidence binding",
    inputsMatch,
    inputsMatch
      ? "operator config matches the production evidence manifest"
      : "The connected config origin and deployment identity must match the production manifest.",
  );
}

const connectedEvidence = findPassedConnectedEvidence({
  commit,
  deployment:
    releaseEvidence?.backend?.deployment ?? connectedConfig?.deployment,
  origin: releaseEvidence?.backend?.origin ?? connectedConfig?.supabaseUrl,
});
record(
  "Connected three-phase evidence",
  Boolean(connectedEvidence),
  connectedEvidence ??
    "Run `pnpm verify:connected:acceptance:full` for this clean commit.",
);

console.log("Organa controlled-beta release readiness");
for (const result of results) {
  const prefix = result.passed ? "PASS" : "BLOCK";
  if (Array.isArray(result.detail)) {
    console.log(`${prefix} ${result.label}:`);
    result.detail.forEach((detail) => console.log(`  - ${detail}`));
  } else {
    console.log(`${prefix} ${result.label}: ${result.detail}`);
  }
}
const blockers = results.filter((result) => !result.passed);
console.log(
  `${results.length - blockers.length} ready; ${blockers.length} blocked.`,
);
if (blockers.length > 0) process.exit(1);

function validateReleaseEvidence(value, context) {
  const errors = [];
  if (!isRecord(value)) return ["The manifest must be a JSON object."];
  requireExactKeys(
    value,
    [
      "artifacts",
      "backend",
      "browsers",
      "candidate",
      "easProjectId",
      "format",
      "organaCommit",
      "physicalDevices",
      "reviews",
      "sourceGateEvidence",
    ],
    "manifest",
    errors,
  );
  if (value.format !== "organa-controlled-beta-release-evidence-v2") {
    errors.push("format is invalid.");
  }
  if (value.candidate !== "production") {
    errors.push("candidate must be production.");
  }
  if (value.organaCommit !== context.commit) {
    errors.push("organaCommit must match the current commit.");
  }
  if (
    !isUuid(value.easProjectId) ||
    value.easProjectId !== context.linkedProjectId
  ) {
    errors.push("easProjectId must match apps/mobile/app.json.");
  }
  if (!isEvidenceReference(value.sourceGateEvidence)) {
    errors.push("sourceGateEvidence needs a non-placeholder reference.");
  }

  validateBackend(value.backend, errors);
  validateArtifacts(value.artifacts, errors);
  validateReferences(
    value.physicalDevices,
    ["android", "ios"],
    "physicalDevices",
    errors,
  );
  validateReferences(
    value.browsers,
    ["chrome", "edge", "firefox", "iosHomeScreenPwa", "safari"],
    "browsers",
    errors,
  );
  validateReferences(
    value.reviews,
    ["dependencyAudit", "legal", "privacy", "security", "store"],
    "reviews",
    errors,
  );
  return errors;
}

function validateBackend(value, errors) {
  if (!isRecord(value)) {
    errors.push("backend must be an object.");
    return;
  }
  requireExactKeys(
    value,
    [
      "deployment",
      "euRegionEvidence",
      "origin",
      "productionRepeatEvidence",
      "providerEvidence",
    ],
    "backend",
    errors,
  );
  if (!isHttpsOrigin(value.origin)) {
    errors.push("backend.origin must be a public HTTPS origin.");
  }
  try {
    validateSupabaseDeployment(value.deployment, "backend.deployment");
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : "backend.deployment is invalid.",
    );
  }
  for (const field of [
    "euRegionEvidence",
    "productionRepeatEvidence",
    "providerEvidence",
  ]) {
    if (!isEvidenceReference(value[field])) {
      errors.push(`backend.${field} needs a non-placeholder reference.`);
    }
  }
}

function validateArtifacts(value, errors) {
  if (!isRecord(value)) {
    errors.push("artifacts must be an object.");
    return;
  }
  requireExactKeys(value, ["android", "ios", "web"], "artifacts", errors);
  validateArtifact(
    value.ios,
    ["buildId", "buildNumber", "sha256"],
    "artifacts.ios",
    errors,
  );
  validateArtifact(
    value.android,
    ["buildId", "sha256", "versionCode"],
    "artifacts.android",
    errors,
  );
  validateArtifact(
    value.web,
    ["deploymentId", "sha256"],
    "artifacts.web",
    errors,
  );
}

function validateArtifact(value, fields, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  requireExactKeys(value, fields, label, errors);
  for (const field of fields) {
    let valid;
    if (field === "sha256") {
      valid = /^[0-9a-f]{64}$/.test(value[field] ?? "");
    } else if (field === "buildNumber" || field === "versionCode") {
      valid = /^[1-9]\d{0,8}$/.test(value[field] ?? "");
    } else {
      valid = isEvidenceReference(value[field]);
    }
    if (!valid) errors.push(`${label}.${field} is invalid.`);
  }
}

function validateReferences(value, fields, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  requireExactKeys(value, fields, label, errors);
  for (const field of fields) {
    if (!isEvidenceReference(value[field])) {
      errors.push(`${label}.${field} needs a non-placeholder reference.`);
    }
  }
}

function requireExactKeys(value, expected, label, errors) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    errors.push(`${label} fields must exactly match the documented template.`);
  }
}

function findPassedConnectedEvidence({
  commit: revision,
  deployment,
  origin,
}) {
  if (!isHttpsOrigin(origin)) {
    return undefined;
  }
  try {
    validateSupabaseDeployment(deployment);
  } catch {
    return undefined;
  }
  const directory = resolve(repositoryRoot, ".organa-connected-evidence");
  let files;
  try {
    const stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return undefined;
    files = readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse();
  } catch {
    return undefined;
  }

  for (const file of files) {
    const path = resolve(directory, file);
    let evidence;
    try {
      evidence = readPrivateJson(path, "Connected evidence");
    } catch {
      continue;
    }
    if (
      evidence.runnerVersion !== 6 ||
      evidence.scope !== "full" ||
      evidence.status !== "passed" ||
      evidence.organaCommit !== revision ||
      evidence.organaCommitConfirmedAtFinish !== true ||
      evidence.connectedConfigConfirmedAtFinish !== true ||
      evidence.supabaseOrigin !== origin ||
      !supabaseDeploymentsMatch(
        evidence.supabaseDeployment,
        deployment,
      ) ||
      !hasPassedPhases(evidence.phases)
    ) {
      continue;
    }
    return file;
  }
  return undefined;
}

function hasPassedPhases(phases) {
  if (!Array.isArray(phases)) return false;
  const passed = new Set(
    phases
      .filter(
        (phase) =>
          isRecord(phase) &&
          phase.status === "passed" &&
          phase.exitCode === 0 &&
          phase.signal === null,
      )
      .map((phase) => phase.name),
  );
  return [
    "connected-supabase",
    "connected-web-push-scheduler",
    "connected-one-hour-deletion",
  ].every((phase) => passed.has(phase));
}

function readPrivateJson(path, label) {
  let pathStats;
  try {
    pathStats = lstatSync(path);
  } catch {
    throw new Error(`${label} is missing or unreadable.`);
  }
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file, not a symlink.`);
  }

  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch {
    throw new Error(`${label} could not be opened safely.`);
  }

  let raw;
  try {
    const fileStats = fstatSync(descriptor);
    if (
      !fileStats.isFile() ||
      fileStats.dev !== pathStats.dev ||
      fileStats.ino !== pathStats.ino
    ) {
      throw new Error(`${label} changed while it was opened.`);
    }
    if (fileStats.size > 64 * 1_024) {
      throw new Error(`${label} exceeds 64 KB.`);
    }
    if (
      typeof process.getuid === "function" &&
      fileStats.uid !== process.getuid()
    ) {
      throw new Error(`${label} must be owned by the current user.`);
    }
    const mode = fileStats.mode & 0o777;
    if (mode !== 0o400 && mode !== 0o600) {
      throw new Error(`${label} must have mode 600 or 400.`);
    }
    raw = readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(raw, "utf8") > 64 * 1_024) {
      throw new Error(`${label} exceeds 64 KB.`);
    }
  } finally {
    closeSync(descriptor);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function readCommit() {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 5_000,
  }).trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("The current Git revision is invalid.");
  }
  return revision;
}

function readGitStatus() {
  return execFileSync("git", ["status", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 5_000,
  });
}

function isEvidenceReference(value) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 8 &&
    !/[\u0000-\u001f]/.test(value) &&
    !/(example|pending|replace|tbd|todo)/i.test(value)
  );
}

function isHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "") &&
      !/(^|\.)example\.(com|net|org)$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(label, passed, detail) {
  results.push({ detail, label, passed });
}
