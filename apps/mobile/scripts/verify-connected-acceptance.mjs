import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readConnectedSupabaseConfig } from "./connected-supabase-config.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const options = parseArguments(process.argv.slice(2));
const configPath = resolve(
  repositoryRoot,
  options.configPath ?? ".organa-connected-supabase.json",
);
const evidenceDirectory = resolve(
  repositoryRoot,
  ".organa-connected-evidence",
);
const config = readConnectedSupabaseConfig(configPath);

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
const phases = [
  {
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
  const phaseStartedAt = new Date();
  console.log(`Starting ${phase.name} acceptance phase.`);
  const result = spawnSync(
    process.execPath,
    [resolve(scriptDirectory, phase.script), ...phase.arguments],
    {
      cwd: repositoryRoot,
      stdio: "inherit",
    },
  );
  const phaseFinishedAt = new Date();
  const passed = result.status === 0 && !result.error && !result.signal;
  phaseEvidence.push({
    durationMs: phaseFinishedAt.getTime() - phaseStartedAt.getTime(),
    exitCode: result.status,
    finishedAt: phaseFinishedAt.toISOString(),
    name: phase.name,
    signal: result.signal ?? null,
    startedAt: phaseStartedAt.toISOString(),
    status: passed ? "passed" : "failed",
  });

  if (!passed) {
    runFailure = new Error(
      `${phase.name} failed; later connected phases were not started.`,
    );
    break;
  }
}

const finishedAt = new Date();
const evidencePath = writeEvidence({
  evidenceDirectory,
  evidence: {
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    finishedAt: finishedAt.toISOString(),
    node: process.version,
    organaCommit,
    phases: phaseEvidence,
    platform: `${process.platform}-${process.arch}`,
    runnerVersion: 1,
    startedAt: startedAt.toISOString(),
    status: runFailure ? "failed" : "passed",
    supabaseOrigin: config.supabaseUrl,
    supabaseSourceRevision: config.supabaseSourceRevision,
  },
  startedAt,
});

console.log(
  `Sanitized connected evidence written to ${relative(repositoryRoot, evidencePath)}.`,
);
if (runFailure) throw runFailure;
console.log(
  `Connected acceptance run passed (${phaseEvidence.length} phases).`,
);

function parseArguments(argumentsList) {
  const parsed = {
    configPath: undefined,
    includeDeletion: false,
    includeWebPush: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--include-deletion") {
      parsed.includeDeletion = true;
    } else if (argument === "--include-web-push") {
      parsed.includeWebPush = true;
    } else if (argument === "--config") {
      parsed.configPath = requireOptionValue(argumentsList, ++index, argument);
    } else {
      throw new Error(
        "Usage: node verify-connected-acceptance.mjs [--config path] [--include-web-push] [--include-deletion]",
      );
    }
  }

  return parsed;
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
  try {
    const stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(
        "The connected evidence path must be a real directory.",
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    mkdirSync(directory, { mode: 0o700, recursive: true });
  }
  chmodSync(directory, 0o700);
}
