import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function readConnectedSupabaseConfig(configPath) {
  const resolvedPath = resolve(
    repositoryRoot,
    configPath ?? ".organa-connected-supabase.json",
  );
  let fileStats;
  try {
    fileStats = lstatSync(resolvedPath);
  } catch {
    throw new Error(
      "The connected Supabase config is missing or unreadable.",
    );
  }
  if (!fileStats.isFile()) {
    throw new Error(
      "The connected Supabase config must be a regular file, not a symlink.",
    );
  }
  const mode = fileStats.mode & 0o777;
  if (mode !== 0o400 && mode !== 0o600) {
    throw new Error(
      "The connected Supabase config must have mode 600 or 400.",
    );
  }
  let config;
  try {
    config = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch {
    throw new Error(
      "The connected Supabase config is unreadable or invalid JSON.",
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
  const supabaseSourceRevision = validateSourceRevision(
    config.supabaseSourceRevision,
  );
  requireConnectedKey(config.publishableKey, "sb_publishable_", "publishableKey");
  requireConnectedKey(config.secretKey, "sb_secret_", "secretKey");
  if (config.publishableKey === config.secretKey) {
    throw new Error("The connected Supabase keys must be distinct.");
  }

  return {
    allowOneHourDeletionDrill: config.allowOneHourDeletionDrill === true,
    allowWebPushSchedulerDrill:
      config.allowWebPushSchedulerDrill === true,
    publishableKey: config.publishableKey,
    secretKey: config.secretKey,
    supabaseSourceRevision,
    supabaseUrl,
  };
}

function validateSourceRevision(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(
      "supabaseSourceRevision must be the recorded 40-character lowercase Git revision.",
    );
  }
  return value;
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
    url.hostname.endsWith(".example.net")
  ) {
    throw new Error("supabaseUrl still uses an example hostname.");
  }
  return url.origin;
}

function requireConnectedKey(value, prefix, name) {
  if (
    typeof value !== "string" ||
    !value.startsWith(prefix) ||
    value.length <= prefix.length + 16 ||
    /\s/.test(value) ||
    /replace|example/i.test(value)
  ) {
    throw new Error(`${name} is missing or is not a valid ${prefix} key.`);
  }
}
