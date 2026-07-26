import { execFileSync } from "node:child_process";
import {
  constants,
  lstatSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export function createLinkedManagedAuthClient(projectRef, profile) {
  requireLinkedProject(projectRef);
  const accessToken = resolveAccessToken(profile);
  const endpoint =
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

  return {
    read: () => request("GET"),
    update: (body) => request("PATCH", body),
  };

  async function request(method, body) {
    let response;
    try {
      response = await fetch(endpoint, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        method,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      fail("the Supabase Management API could not be reached");
    }

    let value;
    try {
      value = await response.json();
    } catch {
      fail(`the Supabase Management API returned HTTP ${response.status}`);
    }
    if (!response.ok) {
      const message =
        typeof value?.message === "string"
          ? value.message
          : typeof value?.error === "string"
            ? value.error
            : "request rejected";
      fail(
        `the Supabase Management API returned HTTP ${response.status}: ${message}`,
      );
    }
    if (!isRecord(value)) {
      fail("the Supabase Management API returned an invalid Auth configuration");
    }
    return value;
  }
}

export function requireProjectRef(value) {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value)) {
    fail("--project-ref must be a 20-character lowercase Supabase project ref");
  }
  return value;
}

export function requireOptionValue(argumentsList, index, option) {
  const value = argumentsList[index];
  if (!value || value.startsWith("-") || /[\r\n]/.test(value)) {
    fail(`${option} requires a value`);
  }
  return value;
}

export function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function resolveAccessToken(profile) {
  const fromEnvironment = normalizeAccessToken(
    process.env.SUPABASE_ACCESS_TOKEN,
  );
  if (fromEnvironment) return fromEnvironment;

  if (process.platform === "darwin") {
    for (const account of [profile, "access-token"]) {
      try {
        const value = execFileSync(
          "security",
          [
            "find-generic-password",
            "-s",
            "Supabase CLI",
            "-a",
            account,
            "-w",
          ],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 15_000,
          },
        );
        const normalized = normalizeAccessToken(value);
        if (normalized) return normalized;
      } catch {
        // The CLI can also use the legacy account or its private file fallback.
      }
    }
  }

  const fallbackPath = resolve(
    process.env.SUPABASE_HOME?.trim() || resolve(homedir(), ".supabase"),
    "access-token",
  );
  try {
    const stats = lstatSync(fallbackPath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (stats.mode & (constants.S_IRWXG | constants.S_IRWXO)) !== 0
    ) {
      fail("the Supabase CLI access-token fallback is not a private file");
    }
    const normalized = normalizeAccessToken(
      readFileSync(fallbackPath, "utf8"),
    );
    if (normalized) return normalized;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("the Supabase CLI access-token fallback could not be read safely");
    }
  }

  fail(
    "authenticate with the Supabase CLI or set SUPABASE_ACCESS_TOKEN for this command",
  );
}

function normalizeAccessToken(value) {
  let normalized = value?.trim() ?? "";
  if (normalized.startsWith("go-keyring-base64:")) {
    try {
      normalized = Buffer.from(
        normalized.slice("go-keyring-base64:".length),
        "base64",
      ).toString("utf8");
    } catch {
      return undefined;
    }
  }
  return /^sbp_(?:oauth_)?[a-f0-9]{40}$/.test(normalized)
    ? normalized
    : undefined;
}

function requireLinkedProject(ref) {
  const linkPath = resolve(repositoryRoot, "supabase/.temp/project-ref");
  try {
    const stats = lstatSync(linkPath);
    const linkedRef = readFileSync(linkPath, "utf8").trim();
    if (!stats.isFile() || stats.isSymbolicLink() || linkedRef !== ref) {
      throw new Error("mismatch");
    }
  } catch {
    fail("the linked Supabase project does not match --project-ref");
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
