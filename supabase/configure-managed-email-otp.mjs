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
const options = parseArguments(process.argv.slice(2));
const projectRef = requireProjectRef(options.projectRef);
const subject = "Your Organa verification code";
const template = readAndValidateTemplate();
const accessToken = resolveAccessToken(options.profile);
const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

requireLinkedProject(projectRef);

const initial = await readAuthConfig();
if (options.checkOnly) {
  reportState(initial);
  process.exitCode = configurationMatches(initial) ? 0 : 1;
} else {
  if (!policyMatches(initial)) {
    await updateAuthConfig({
      mailer_otp_exp: 900,
      mailer_otp_length: 6,
    });
    console.log("Managed email OTP policy set to 6 digits and 15 minutes.");
  }

  if (!templatesMatch(initial)) {
    if (!hasCustomSmtp(initial)) {
      fail(
        "managed OTP policy is ready, but custom SMTP is not configured; " +
          "Supabase free-tier projects using the default mail provider reject " +
          "custom email templates",
      );
    }
    await updateAuthConfig({
      mailer_subjects_confirmation: subject,
      mailer_subjects_magic_link: subject,
      mailer_templates_confirmation_content: template,
      mailer_templates_magic_link_content: template,
    });
  }

  const verified = await readAuthConfig();
  if (!configurationMatches(verified)) {
    fail("managed email OTP configuration did not match after the update");
  }
  reportState(verified);
}

async function readAuthConfig() {
  return request("GET");
}

async function updateAuthConfig(body) {
  return request("PATCH", body);
}

async function request(method, body) {
  let response;
  try {
    response = await fetch(endpoint, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
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

function reportState(config) {
  console.log(
    [
      "Managed email OTP configuration:",
      `- policy: ${policyMatches(config) ? "6 digits / 15 minutes" : "does not match"}`,
      `- confirmation email: ${templateState(config.mailer_templates_confirmation_content)}`,
      `- returning-user email: ${templateState(config.mailer_templates_magic_link_content)}`,
      `- custom SMTP: ${hasCustomSmtp(config) ? "configured" : "not configured"}`,
      "- secrets and template bodies were not printed",
    ].join("\n"),
  );
}

function templateState(content) {
  if (typeof content !== "string") return "missing";
  if (
    content.includes("{{ .Token }}") &&
    !content.includes("{{ .ConfirmationURL }}") &&
    !content.includes("{{ .TokenHash }}")
  ) {
    return "six-digit code";
  }
  if (
    content.includes("{{ .ConfirmationURL }}") ||
    content.includes("{{ .TokenHash }}")
  ) {
    return "link";
  }
  return "unknown";
}

function configurationMatches(config) {
  return policyMatches(config) && templatesMatch(config);
}

function policyMatches(config) {
  return config.mailer_otp_length === 6 && config.mailer_otp_exp === 900;
}

function templatesMatch(config) {
  return (
    config.mailer_subjects_confirmation === subject &&
    config.mailer_subjects_magic_link === subject &&
    config.mailer_templates_confirmation_content === template &&
    config.mailer_templates_magic_link_content === template
  );
}

function hasCustomSmtp(config) {
  return (
    typeof config.smtp_host === "string" &&
    config.smtp_host.trim().length > 0 &&
    typeof config.smtp_admin_email === "string" &&
    config.smtp_admin_email.trim().length > 0
  );
}

function readAndValidateTemplate() {
  let content;
  try {
    content = readFileSync(
      resolve(repositoryRoot, "supabase/templates/email-code.html"),
      "utf8",
    );
  } catch {
    fail("the checked-in Organa email-code template could not be read");
  }
  if (
    !content.includes("{{ .Token }}") ||
    content.includes("{{ .ConfirmationURL }}") ||
    content.includes("{{ .TokenHash }}")
  ) {
    fail("the checked-in Organa email template is not code-only");
  }
  return content;
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

function requireProjectRef(value) {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value)) {
    fail("--project-ref must be a 20-character lowercase Supabase project ref");
  }
  return value;
}

function parseArguments(argumentsList) {
  const parsed = {
    checkOnly: false,
    profile: "supabase",
    projectRef: undefined,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--" && index === 0) {
      continue;
    } else if (argument === "--check-only") {
      parsed.checkOnly = true;
    } else if (argument === "--profile") {
      parsed.profile = requireValue(argumentsList, ++index, argument);
    } else if (argument === "--project-ref") {
      parsed.projectRef = requireValue(argumentsList, ++index, argument);
    } else {
      usage();
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(parsed.profile)) {
    fail("--profile contains unsupported characters");
  }
  return parsed;
}

function requireValue(argumentsList, index, option) {
  const value = argumentsList[index];
  if (!value || value.startsWith("-") || /[\r\n]/.test(value)) {
    fail(`${option} requires a value`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usage() {
  fail(
    "usage: node supabase/configure-managed-email-otp.mjs " +
      "--project-ref REF [--profile NAME] [--check-only]",
  );
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
