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

import { validateSupabaseDeployment } from "./supabase-deployment.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const MAX_CONFIG_BYTES = 16 * 1_024;
const allowedConfigKeys = new Set([
  "allowOneHourDeletionDrill",
  "allowSyntheticAccountCreationAndDeletion",
  "allowWebPushSchedulerDrill",
  "deployment",
  "publishableKey",
  "purpose",
  "secretKey",
  "supabaseUrl",
]);

export function readConnectedSupabaseConfig(configPath) {
  const resolvedPath = resolve(
    repositoryRoot,
    configPath ?? ".organa-connected-supabase.json",
  );
  let pathStats;
  try {
    pathStats = lstatSync(resolvedPath);
  } catch {
    throw new Error(
      "The connected Supabase config is missing or unreadable.",
    );
  }
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    throw new Error(
      "The connected Supabase config must be a regular file, not a symlink.",
    );
  }

  let descriptor;
  try {
    descriptor = openSync(
      resolvedPath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch {
    throw new Error(
      "The connected Supabase config could not be opened safely.",
    );
  }

  let fileStats;
  let rawConfig;
  try {
    fileStats = fstatSync(descriptor);
    if (
      !fileStats.isFile() ||
      fileStats.dev !== pathStats.dev ||
      fileStats.ino !== pathStats.ino
    ) {
      throw new Error(
        "The connected Supabase config changed while it was opened.",
      );
    }
    if (
      typeof process.getuid === "function" &&
      fileStats.uid !== process.getuid()
    ) {
      throw new Error(
        "The connected Supabase config must be owned by the current user.",
      );
    }
    const mode = fileStats.mode & 0o777;
    if (mode !== 0o400 && mode !== 0o600) {
      throw new Error(
        "The connected Supabase config must have mode 600 or 400.",
      );
    }
    if (fileStats.size > MAX_CONFIG_BYTES) {
      throw new Error(
        "The connected Supabase config exceeds the size limit.",
      );
    }
    rawConfig = readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(rawConfig, "utf8") > MAX_CONFIG_BYTES) {
      throw new Error(
        "The connected Supabase config exceeds the size limit.",
      );
    }
  } finally {
    closeSync(descriptor);
  }

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch {
    throw new Error(
      "The connected Supabase config is unreadable or invalid JSON.",
    );
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).some((key) => !allowedConfigKeys.has(key))
  ) {
    throw new Error(
      "The connected Supabase config contains unsupported fields.",
    );
  }
  if (
    config?.purpose !== "organa-controlled-beta-test" ||
    config?.allowSyntheticAccountCreationAndDeletion !== true
  ) {
    throw new Error(
      "The connected Supabase config must explicitly allow controlled-beta synthetic account creation and deletion.",
    );
  }

  const supabaseUrl = validateConnectedUrl(config.supabaseUrl);
  const deployment = validateSupabaseDeployment(config.deployment);
  const currentMigrationVersion = readCurrentMigrationVersion();
  if (deployment.migrationVersion !== currentMigrationVersion) {
    throw new Error(
      `deployment.migrationVersion must match the current migration head ${currentMigrationVersion}.`,
    );
  }
  requireConnectedKey(config.publishableKey, "sb_publishable_", "publishableKey");
  requireConnectedKey(config.secretKey, "sb_secret_", "secretKey");
  if (config.publishableKey === config.secretKey) {
    throw new Error("The connected Supabase keys must be distinct.");
  }

  return {
    allowOneHourDeletionDrill: config.allowOneHourDeletionDrill === true,
    allowWebPushSchedulerDrill:
      config.allowWebPushSchedulerDrill === true,
    deployment,
    publishableKey: config.publishableKey,
    secretKey: config.secretKey,
    supabaseUrl,
  };
}

function readCurrentMigrationVersion() {
  let versions;
  try {
    versions = readdirSync(resolve(repositoryRoot, "supabase/migrations"))
      .map((file) => /^(\d{14})_.+\.sql$/.exec(file)?.[1])
      .filter(Boolean)
      .sort();
  } catch {
    throw new Error(
      "The current Supabase migration head could not be inspected.",
    );
  }
  const current = versions.at(-1);
  if (!current) {
    throw new Error("The repository does not contain a Supabase migration.");
  }
  return current;
}

function validateConnectedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("supabaseUrl must be a valid HTTPS URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "supabaseUrl must be an HTTPS origin without credentials, query, fragment, or path.",
    );
  }
  if (
    url.hostname === "example.com" ||
    url.hostname.endsWith(".example.com") ||
    url.hostname === "example.net" ||
    url.hostname.endsWith(".example.net") ||
    url.hostname === "example.org" ||
    url.hostname.endsWith(".example.org") ||
    url.hostname.endsWith(".example") ||
    url.hostname.endsWith(".invalid") ||
    url.hostname.endsWith(".test") ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new Error(
      "supabaseUrl still uses a placeholder or non-public hostname.",
    );
  }
  return url.origin;
}

function requireConnectedKey(value, prefix, name) {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    value.length <= prefix.length + 16 ||
    !/^[\x21-\x7e]+$/.test(value) ||
    /replace|example/i.test(value)
  ) {
    throw new Error(`${name} is missing or is not a valid ${prefix} key.`);
  }
}
