import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createLinkedManagedAuthClient,
  fail,
  requireOptionValue,
  requireProjectRef,
} from "./managed-auth-api.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const options = parseArguments(process.argv.slice(2));
const projectRef = requireProjectRef(options.projectRef);
const subject = "Your Organa verification code";
const template = readAndValidateTemplate();
const auth = createLinkedManagedAuthClient(projectRef, options.profile);

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
  return auth.read();
}

async function updateAuthConfig(body) {
  return auth.update(body);
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
  return parsed;
}

function usage() {
  fail(
    "usage: node supabase/configure-managed-email-otp.mjs " +
      "--project-ref REF [--profile NAME] [--check-only]",
  );
}
