import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createLinkedManagedAuthClient,
  fail,
  requireOptionValue,
  requireProjectRef,
} from "./managed-auth-api.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const maxCredentialsBytes = 8 * 1_024;
const options = parseArguments(process.argv.slice(2));
const projectRef = requireProjectRef(options.projectRef);
const callbackUrl =
  `https://${projectRef}.supabase.co/auth/v1/callback`;

if (options.validateOnly) {
  const credentials = readCredentials(options.credentialsFile);
  console.log(
    [
      "Managed OAuth credentials validation:",
      `- provider callback: ${callbackUrl}`,
      `- Google credentials: ${credentials.google ? "valid shape" : "not provided"}`,
      `- GitHub credentials: ${credentials.github ? "valid shape" : "not provided"}`,
      "- client IDs and secrets were not printed",
    ].join("\n"),
  );
  process.exit(0);
}

const auth = createLinkedManagedAuthClient(projectRef, options.profile);
const initial = await auth.read();
if (options.checkOnly) {
  reportState(initial);
  process.exitCode = configurationMatches(initial) ? 0 : 1;
} else {
  const credentials = readCredentials(options.credentialsFile);
  const update = {};
  if (credentials.google) {
    Object.assign(update, {
      external_google_client_id: credentials.google.clientId,
      external_google_enabled: true,
      external_google_secret: credentials.google.clientSecret,
      external_google_skip_nonce_check: false,
    });
  }
  if (credentials.github) {
    Object.assign(update, {
      external_github_client_id: credentials.github.clientId,
      external_github_enabled: true,
      external_github_secret: credentials.github.clientSecret,
    });
  }

  await auth.update(update);
  const verified = await auth.read();
  for (const provider of Object.keys(credentials)) {
    if (!providerMatches(verified, provider, credentials[provider].clientId)) {
      fail(`${provider} OAuth did not match after the managed update`);
    }
  }
  reportState(verified);
}

function configurationMatches(config) {
  return providerEnabled(config, "google") && providerEnabled(config, "github");
}

function providerMatches(config, provider, expectedClientId) {
  return (
    providerEnabled(config, provider) &&
    config[`external_${provider}_client_id`] === expectedClientId
  );
}

function providerEnabled(config, provider) {
  const clientId = config[`external_${provider}_client_id`];
  return (
    config[`external_${provider}_enabled`] === true &&
    typeof clientId === "string" &&
    clientId.trim().length > 0
  );
}

function reportState(config) {
  console.log(
    [
      "Managed OAuth configuration:",
      `- provider callback: ${callbackUrl}`,
      `- Google: ${providerEnabled(config, "google") ? "enabled" : "disabled or incomplete"}`,
      `- GitHub: ${providerEnabled(config, "github") ? "enabled" : "disabled or incomplete"}`,
      "- client IDs and secrets were not printed",
    ].join("\n"),
  );
}

function readCredentials(pathValue) {
  const path = resolve(repositoryRoot, pathValue);
  const rawCredentials = readPrivateFile(path);
  let parsed;
  try {
    parsed = JSON.parse(rawCredentials);
  } catch (error) {
    if (error instanceof SyntaxError) {
      fail("the OAuth credentials file is not valid JSON");
    }
    fail("the OAuth credentials file could not be parsed safely");
  }

  requireExactKeys(parsed, ["github", "google"], true, "OAuth credentials");
  const credentials = {};
  if (parsed.google !== undefined) {
    credentials.google = readProviderCredentials("google", parsed.google);
  }
  if (parsed.github !== undefined) {
    credentials.github = readProviderCredentials("github", parsed.github);
  }
  if (Object.keys(credentials).length === 0) {
    fail("the OAuth credentials file must configure Google, GitHub, or both");
  }
  return credentials;
}

function readPrivateFile(path) {
  let pathStats;
  try {
    pathStats = lstatSync(path);
  } catch {
    fail(
      `OAuth credentials file not found; start from ${options.credentialsFile === ".organa-managed-oauth.json" ? ".organa-managed-oauth.example.json" : "the documented private template"}`,
    );
  }
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    fail("the OAuth credentials file must be a regular file, not a symlink");
  }

  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
  } catch {
    fail("the OAuth credentials file could not be opened safely");
  }

  try {
    const fileStats = fstatSync(descriptor);
    if (
      !fileStats.isFile() ||
      fileStats.dev !== pathStats.dev ||
      fileStats.ino !== pathStats.ino
    ) {
      fail("the OAuth credentials file changed while it was opened");
    }
    if (
      typeof process.getuid === "function" &&
      fileStats.uid !== process.getuid()
    ) {
      fail("the OAuth credentials file must be owned by the current user");
    }
    if (
      typeof process.getuid === "function" &&
      ![0o400, 0o600].includes(fileStats.mode & 0o777)
    ) {
      fail("the OAuth credentials file must have mode 600 or 400");
    }
    if (fileStats.size > maxCredentialsBytes) {
      fail("the OAuth credentials file exceeds the size limit");
    }
    const content = readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(content, "utf8") > maxCredentialsBytes) {
      fail("the OAuth credentials file exceeds the size limit");
    }
    return content;
  } finally {
    closeSync(descriptor);
  }
}

function readProviderCredentials(provider, value) {
  requireExactKeys(
    value,
    ["clientId", "clientSecret"],
    false,
    `${provider} credentials`,
  );
  const clientId = requireCredential(
    value.clientId,
    `${provider} clientId`,
    provider === "google"
      ? /^[A-Za-z0-9_-]{10,}\.apps\.googleusercontent\.com$/
      : /^[A-Za-z0-9._-]{16,128}$/,
  );
  const clientSecret = requireCredential(
    value.clientSecret,
    `${provider} clientSecret`,
    /^[\x21-\x7e]{16,256}$/,
  );
  return { clientId, clientSecret };
}

function requireCredential(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${name} is missing or malformed`);
  }
  if (/replace|example|your-/i.test(value)) {
    fail(`${name} still contains a placeholder`);
  }
  return value;
}

function requireExactKeys(value, allowedKeys, optional, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowedKeys.includes(key)) ||
    (!optional && allowedKeys.some((key) => !keys.includes(key)))
  ) {
    fail(`${label} has missing or unsupported fields`);
  }
}

function parseArguments(argumentsList) {
  const parsed = {
    checkOnly: false,
    credentialsFile: ".organa-managed-oauth.json",
    profile: "supabase",
    projectRef: undefined,
    validateOnly: false,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--" && index === 0) {
      continue;
    } else if (argument === "--check-only") {
      parsed.checkOnly = true;
    } else if (argument === "--validate-only") {
      parsed.validateOnly = true;
    } else if (argument === "--credentials-file") {
      parsed.credentialsFile = requireOptionValue(
        argumentsList,
        ++index,
        argument,
      );
    } else if (argument === "--profile") {
      parsed.profile = requireOptionValue(argumentsList, ++index, argument);
    } else if (argument === "--project-ref") {
      parsed.projectRef = requireOptionValue(argumentsList, ++index, argument);
    } else {
      usage();
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(parsed.profile)) {
    fail("--profile contains unsupported characters");
  }
  if (parsed.checkOnly && parsed.validateOnly) {
    fail("--check-only and --validate-only cannot be combined");
  }
  return parsed;
}

function usage() {
  fail(
    "usage: node supabase/configure-managed-oauth.mjs " +
      "--project-ref REF [--credentials-file PRIVATE_JSON] " +
      "[--profile NAME] [--check-only | --validate-only]",
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
