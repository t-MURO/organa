import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readConnectedSupabaseConfig } from "../apps/mobile/scripts/connected-supabase-config.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const MAX_CONFIG_BYTES = 16 * 1_024;

try {
  configureConsent();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "ERROR: consent update failed",
  );
  process.exitCode = 1;
}

function configureConsent() {
  const options = parseArguments(process.argv.slice(2));
  const configPath = resolve(
    repositoryRoot,
    options.configPath ?? ".organa-connected-supabase.json",
  );

  requireRepositoryPath(configPath);
  readConnectedSupabaseConfig(configPath);

  const { mode, raw, stats } = readPrivateConfig(configPath);
  const config = JSON.parse(raw);
  if (options.webPush !== undefined) {
    config.allowWebPushSchedulerDrill = options.webPush;
  }
  if (options.oneHourDeletion !== undefined) {
    config.allowOneHourDeletionDrill = options.oneHourDeletion;
  }

  writeValidatedReplacement({
    config,
    configPath,
    mode,
    originalStats: stats,
  });

  console.log(
    `Web Push scheduler drill: ${config.allowWebPushSchedulerDrill ? "enabled" : "disabled"}.`,
  );
  console.log(
    `One-hour deletion drill: ${config.allowOneHourDeletionDrill ? "enabled" : "disabled"}.`,
  );
  console.log("No credentials or private identifiers were printed.");
}

function parseArguments(argumentsList) {
  const parsed = {
    configPath: undefined,
    oneHourDeletion: undefined,
    webPush: undefined,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--" && index === 0) {
      continue;
    }
    if (argument === "--config") {
      if (parsed.configPath !== undefined) fail("--config was provided twice");
      parsed.configPath = requireValue(argumentsList, ++index, argument);
      continue;
    }
    if (argument === "--web-push") {
      if (parsed.webPush !== undefined) {
        fail("--web-push was provided twice");
      }
      parsed.webPush = parseState(
        requireValue(argumentsList, ++index, argument),
        argument,
      );
      continue;
    }
    if (argument === "--one-hour-deletion") {
      if (parsed.oneHourDeletion !== undefined) {
        fail("--one-hour-deletion was provided twice");
      }
      parsed.oneHourDeletion = parseState(
        requireValue(argumentsList, ++index, argument),
        argument,
      );
      continue;
    }
    usage();
  }
  if (
    parsed.webPush === undefined &&
    parsed.oneHourDeletion === undefined
  ) {
    usage();
  }
  return parsed;
}

function parseState(value, option) {
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  fail(`${option} must be enabled or disabled`);
}

function requireValue(argumentsList, index, option) {
  const value = argumentsList[index];
  if (!value || value.startsWith("-") || /[\r\n]/.test(value)) {
    fail(`${option} requires a value`);
  }
  return value;
}

function requireRepositoryPath(path) {
  const relativePath = relative(repositoryRoot, path);
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    fail("the config path must stay inside the Organa repository");
  }
}

function readPrivateConfig(path) {
  let pathStats;
  try {
    pathStats = lstatSync(path);
  } catch {
    fail("the connected Supabase config is missing or unreadable");
  }
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    fail("the connected Supabase config must be a regular file");
  }
  if (
    typeof process.getuid === "function" &&
    pathStats.uid !== process.getuid()
  ) {
    fail("the connected Supabase config must be owned by the current user");
  }
  const mode = pathStats.mode & 0o777;
  if (mode !== 0o400 && mode !== 0o600) {
    fail("the connected Supabase config must have mode 600 or 400");
  }

  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const openedStats = fstatSync(descriptor);
    if (
      !openedStats.isFile() ||
      openedStats.dev !== pathStats.dev ||
      openedStats.ino !== pathStats.ino ||
      openedStats.size > MAX_CONFIG_BYTES
    ) {
      fail("the connected Supabase config changed while it was opened");
    }
    const raw = readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_CONFIG_BYTES) {
      fail("the connected Supabase config exceeds the size limit");
    }
    return { mode, raw, stats: openedStats };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeValidatedReplacement({
  config,
  configPath,
  mode,
  originalStats,
}) {
  const temporaryPath = `${configPath}.tmp-${process.pid}-${randomUUID()}`;
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONFIG_BYTES) {
    fail("the updated connected Supabase config exceeds the size limit");
  }

  let descriptor;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    writeFileSync(descriptor, serialized, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    readConnectedSupabaseConfig(temporaryPath);
    const currentStats = lstatSync(configPath);
    if (
      !currentStats.isFile() ||
      currentStats.isSymbolicLink() ||
      currentStats.dev !== originalStats.dev ||
      currentStats.ino !== originalStats.ino
    ) {
      fail("the connected Supabase config changed before replacement");
    }
    renameSync(temporaryPath, configPath);
    chmodSync(configPath, mode);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may already have been renamed or removed.
    }
    if (error instanceof Error && error.message.startsWith("ERROR:")) {
      throw error;
    }
    fail("the connected Supabase config could not be updated safely");
  }
}

function usage() {
  fail(
    "usage: node supabase/configure-connected-drill-consent.mjs [--config PATH] [--web-push enabled|disabled] [--one-hour-deletion enabled|disabled]",
  );
}

function fail(message) {
  throw new Error(`ERROR: ${message}`);
}
