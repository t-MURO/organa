import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";
import { supabaseDeploymentsMatch } from "./supabase-deployment.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const options = readOperatorInput(() =>
  parseArguments(process.argv.slice(2)),
);
const configPath = resolve(
  repositoryRoot,
  options.configPath ?? ".organa-connected-supabase.json",
);
const evidenceDirectory = resolve(
  repositoryRoot,
  ".organa-connected-evidence",
);
const config = readOperatorInput(() =>
  readConnectedSupabaseConfig(configPath),
);
if (options.configOnly) {
  console.log(
    "Connected Supabase operator config passed private-file and value validation.",
  );
  process.exit(0);
}
let activeChild;
let interruptedSignal;
const signalHandlers = new Map();
const handledSignals =
  process.platform === "win32"
    ? ["SIGINT", "SIGTERM"]
    : ["SIGHUP", "SIGINT", "SIGTERM"];

function readOperatorInput(read) {
  try {
    return read();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Connected acceptance configuration is invalid.";
    console.error(`Connected acceptance cannot start: ${message}`);
    console.error(
      "Prepare the private config with the managed helper documented in docs/MANAGED_SUPABASE_TESTING.md.",
    );
    process.exit(1);
  }
}

for (const signal of handledSignals) {
  const handler = () => {
    const firstInterruption = !interruptedSignal;
    interruptedSignal ??= signal;
    if (firstInterruption && activeChild) {
      activeChild.kill(signal);
    }
  };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

if (options.includeWebPush && !config.allowWebPushSchedulerDrill) {
  throw new Error(
    "The config must explicitly allow the Web Push scheduler drill.",
  );
}
if (options.includeDeletion && !config.allowOneHourDeletionDrill) {
  throw new Error(
    "The config must explicitly allow the one-hour deletion drill.",
  );
}

const organaCommit = readCleanCommit();
const evidenceScope = readEvidenceScope(options);
const phases = [
  options.backendOnly
    ? {
        arguments: ["--connected-backend", configPath],
        name: "connected-backend-contract",
        script: "verify-local-supabase.mjs",
      }
    : {
        arguments: ["--connected", configPath],
        name: "connected-supabase",
        script: "verify-local-supabase.mjs",
      },
];
if (options.includeWebPush) {
  phases.push({
    arguments: [configPath],
    name: "connected-web-push-scheduler",
    script: "verify-connected-web-push.mjs",
  });
}
if (options.includeDeletion) {
  phases.push({
    arguments: [configPath],
    name: "connected-one-hour-deletion",
    script: "verify-connected-deletion.mjs",
  });
}

const startedAt = new Date();
const phaseEvidence = [];
let runFailure;

for (const phase of phases) {
  if (interruptedSignal) {
    runFailure = new Error(
      `Connected acceptance was interrupted by ${interruptedSignal}; later phases were not started.`,
    );
    break;
  }
  try {
    requireUnchangedRunInputs();
  } catch (error) {
    runFailure =
      error instanceof Error
        ? error
        : new Error("Connected acceptance inputs changed.");
    break;
  }

  const phaseStartedAt = new Date();
  console.log(`Starting ${phase.name} acceptance phase.`);
  const result = await runPhase(phase);
  const phaseFinishedAt = new Date();
  const passed =
    result.status === 0 &&
    !result.errorCode &&
    !result.signal &&
    !interruptedSignal;
  phaseEvidence.push({
    durationMs: phaseFinishedAt.getTime() - phaseStartedAt.getTime(),
    errorCode: result.errorCode,
    exitCode: result.status,
    finishedAt: phaseFinishedAt.toISOString(),
    name: phase.name,
    signal: result.signal ?? null,
    startedAt: phaseStartedAt.toISOString(),
    status: passed ? "passed" : "failed",
  });

  if (!passed) {
    runFailure = interruptedSignal
      ? new Error(
          `${phase.name} was interrupted by ${interruptedSignal}; later connected phases were not started.`,
        )
      : new Error(
          `${phase.name} failed; later connected phases were not started.`,
        );
    break;
  }
}

if (interruptedSignal && !runFailure) {
  runFailure = new Error(
    `Connected acceptance was interrupted by ${interruptedSignal}.`,
  );
}

let organaCommitConfirmedAtFinish = false;
let connectedConfigConfirmedAtFinish = false;
try {
  organaCommitConfirmedAtFinish =
    readCleanCommit() === organaCommit;
} catch {
  organaCommitConfirmedAtFinish = false;
}
if (!organaCommitConfirmedAtFinish && !runFailure) {
  runFailure = new Error(
    "The Organa source state changed during connected acceptance.",
  );
}
try {
  connectedConfigConfirmedAtFinish = connectedConfigsMatch(
    readConnectedSupabaseConfig(configPath),
    config,
  );
} catch {
  connectedConfigConfirmedAtFinish = false;
}
if (!connectedConfigConfirmedAtFinish && !runFailure) {
  runFailure = new Error(
    "The connected Supabase operator config changed during acceptance.",
  );
}

stopHandlingSignals();
if (interruptedSignal && !runFailure) {
  runFailure = new Error(
    `Connected acceptance was interrupted by ${interruptedSignal}.`,
  );
}

const finishedAt = new Date();
const evidencePath = writeEvidence({
  evidenceDirectory,
  evidence: {
    connectedConfigConfirmedAtFinish,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    finishedAt: finishedAt.toISOString(),
    interruptedBy: interruptedSignal ?? null,
    node: process.version,
    organaCommit,
    organaCommitConfirmedAtFinish,
    phases: phaseEvidence,
    platform: `${process.platform}-${process.arch}`,
    runnerVersion: 7,
    scope: evidenceScope,
    startedAt: startedAt.toISOString(),
    status: runFailure ? "failed" : "passed",
    supabaseDeployment: config.deployment,
    supabaseOrigin: config.supabaseUrl,
    supabasePurpose: config.purpose,
  },
  startedAt,
});

console.log(
  `Sanitized connected evidence written to ${relative(repositoryRoot, evidencePath)}.`,
);
if (runFailure) throw runFailure;
console.log(
  `Connected ${evidenceScope} acceptance run passed (${phaseEvidence.length} ${
    phaseEvidence.length === 1 ? "phase" : "phases"
  }).`,
);

function runPhase(phase) {
  return new Promise((resolvePhase) => {
    let child;
    try {
      child = spawn(
        process.execPath,
        [resolve(scriptDirectory, phase.script), ...phase.arguments],
        {
          cwd: repositoryRoot,
          stdio: "inherit",
        },
      );
    } catch (error) {
      resolvePhase({
        errorCode: sanitizeSpawnErrorCode(error),
        signal: null,
        status: null,
      });
      return;
    }

    activeChild = child;
    let errorCode = null;
    child.once("error", (error) => {
      errorCode = sanitizeSpawnErrorCode(error);
    });
    child.once("close", (status, signal) => {
      if (activeChild === child) activeChild = undefined;
      resolvePhase({
        errorCode,
        signal: signal ?? null,
        status,
      });
    });

    if (interruptedSignal) {
      child.kill(interruptedSignal);
    }
  });
}

function sanitizeSpawnErrorCode(error) {
  return typeof error?.code === "string" &&
    /^[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : "UNKNOWN";
}

function stopHandlingSignals() {
  for (const [signal, handler] of signalHandlers) {
    process.removeListener(signal, handler);
  }
  signalHandlers.clear();
}

function requireUnchangedRunInputs() {
  if (readCleanCommit() !== organaCommit) {
    throw new Error(
      "The Organa source state changed before a connected phase.",
    );
  }
  let currentConfig;
  try {
    currentConfig = readConnectedSupabaseConfig(configPath);
  } catch {
    throw new Error(
      "The connected Supabase operator config changed before a phase.",
    );
  }
  if (!connectedConfigsMatch(currentConfig, config)) {
    throw new Error(
      "The connected Supabase operator config changed before a phase.",
    );
  }
}

function connectedConfigsMatch(left, right) {
  return (
    left.allowOneHourDeletionDrill === right.allowOneHourDeletionDrill &&
    left.allowWebPushSchedulerDrill === right.allowWebPushSchedulerDrill &&
    left.purpose === right.purpose &&
    left.publishableKey === right.publishableKey &&
    left.secretKey === right.secretKey &&
    supabaseDeploymentsMatch(left.deployment, right.deployment) &&
    left.supabaseUrl === right.supabaseUrl
  );
}

function parseArguments(argumentsList) {
  const parsed = {
    backendOnly: false,
    configPath: undefined,
    configOnly: false,
    includeDeletion: false,
    includeWebPush: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--backend-only") {
      parsed.backendOnly = true;
    } else if (argument === "--include-deletion") {
      parsed.includeDeletion = true;
    } else if (argument === "--include-web-push") {
      parsed.includeWebPush = true;
    } else if (argument === "--config-only") {
      parsed.configOnly = true;
    } else if (argument === "--config") {
      parsed.configPath = requireOptionValue(argumentsList, ++index, argument);
    } else {
      throw new Error(
        "Usage: node verify-connected-acceptance.mjs [--backend-only] [--config path] [--config-only] [--include-web-push] [--include-deletion]",
      );
    }
  }

  if (
    parsed.configOnly &&
    (parsed.backendOnly ||
      parsed.includeDeletion ||
      parsed.includeWebPush)
  ) {
    throw new Error(
      "--config-only cannot be combined with a connected acceptance phase.",
    );
  }

  return parsed;
}

function readEvidenceScope({
  backendOnly,
  includeDeletion,
  includeWebPush,
}) {
  if (backendOnly) return "backend-only";
  if (includeDeletion && includeWebPush) return "full";
  return "partial";
}

function requireOptionValue(argumentsList, index, option) {
  const value = argumentsList[index];
  if (!value || value.startsWith("--") || /[\r\n]/.test(value)) {
    throw new Error(`${option} requires one path value.`);
  }
  return value;
}

function readCleanCommit() {
  let status;
  let revision;
  try {
    status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error("The Organa Git revision could not be inspected.");
  }

  if (status.trim()) {
    throw new Error(
      "Connected acceptance must run from a clean Organa commit.",
    );
  }
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("The Organa Git revision is invalid.");
  }
  return revision;
}

function writeEvidence({
  evidenceDirectory: directory,
  evidence,
  startedAt: runStartedAt,
}) {
  ensurePrivateDirectory(directory);
  const timestamp = runStartedAt
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const path = resolve(
    directory,
    `connected-${timestamp}-${evidence.organaCommit.slice(0, 12)}.json`,
  );
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return path;
}

function ensurePrivateDirectory(directory) {
  let stats;
  try {
    stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(
        "The connected evidence path must be a real directory.",
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    mkdirSync(directory, { mode: 0o700, recursive: true });
    stats = lstatSync(directory);
  }
  if (
    typeof process.getuid === "function" &&
    stats.uid !== process.getuid()
  ) {
    throw new Error(
      "The connected evidence directory must be owned by the current user.",
    );
  }
  chmodSync(directory, 0o700);
}
