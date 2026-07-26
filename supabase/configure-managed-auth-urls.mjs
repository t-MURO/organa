import {
  createLinkedManagedAuthClient,
  fail,
  requireOptionValue,
  requireProjectRef,
} from "./managed-auth-api.mjs";

const options = parseArguments(process.argv.slice(2));
const projectRef = requireProjectRef(options.projectRef);
const siteUrl = requireSiteUrl(options.siteUrl);
const redirectUrls = [
  `${siteUrl}/**`,
  "organa://**",
  "http://localhost:8081/**",
  "http://localhost:4173/**",
];
const auth = createLinkedManagedAuthClient(projectRef, options.profile);

const initial = await auth.read();
if (options.checkOnly) {
  reportState(initial);
  process.exitCode = configurationMatches(initial) ? 0 : 1;
} else {
  if (!configurationMatches(initial)) {
    await auth.update({
      site_url: siteUrl,
      uri_allow_list: redirectUrls.join(","),
    });
  }

  const verified = await auth.read();
  if (!configurationMatches(verified)) {
    fail("managed Auth URL configuration did not match after the update");
  }
  reportState(verified);
}

function configurationMatches(config) {
  if (config.site_url !== siteUrl) return false;
  const configuredRedirects = readRedirectUrls(config.uri_allow_list);
  return (
    configuredRedirects.length === redirectUrls.length &&
    redirectUrls.every((value) => configuredRedirects.includes(value))
  );
}

function readRedirectUrls(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function reportState(config) {
  const matches = configurationMatches(config);
  console.log(
    [
      "Managed Auth URL configuration:",
      `- exact Organa URL set: ${matches ? "configured" : "does not match"}`,
      `- expected Site URL: ${siteUrl}`,
      `- expected redirects: ${redirectUrls.join(", ")}`,
      "- credentials and unrelated Auth settings were not printed",
    ].join("\n"),
  );
}

function requireSiteUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("--site-url must be a valid HTTPS origin");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    fail(
      "--site-url must be an HTTPS origin without credentials, query, fragment, or path",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "example.com" ||
    hostname.endsWith(".example.com") ||
    hostname === "example.net" ||
    hostname.endsWith(".example.net") ||
    hostname === "example.org" ||
    hostname.endsWith(".example.org") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".test") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  ) {
    fail("--site-url must not use a placeholder or local-only hostname");
  }

  return parsed.origin;
}

function parseArguments(argumentsList) {
  const parsed = {
    checkOnly: false,
    profile: "supabase",
    projectRef: undefined,
    siteUrl: undefined,
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
    } else if (argument === "--site-url") {
      parsed.siteUrl = requireOptionValue(argumentsList, ++index, argument);
    } else {
      usage();
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(parsed.profile)) {
    fail("--profile contains unsupported characters");
  }
  if (!parsed.siteUrl) usage();
  return parsed;
}

function usage() {
  fail(
    "usage: node supabase/configure-managed-auth-urls.mjs " +
      "--project-ref REF --site-url HTTPS_ORIGIN " +
      "[--profile NAME] [--check-only]",
  );
}
