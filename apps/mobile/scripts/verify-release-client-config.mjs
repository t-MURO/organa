import { createECDH } from "node:crypto";

const supabaseUrlName = "EXPO_PUBLIC_SUPABASE_URL";
const publishableKeyName = "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const vapidPublicKeyName = "EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY";

const errors = [];

validateSupabaseUrl(process.env[supabaseUrlName]);
validatePublishableKey(process.env[publishableKeyName]);
validateVapidPublicKey(process.env[vapidPublicKeyName]);

if (errors.length > 0) {
  console.error("Organa release client configuration is invalid:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error(
    "Configure all three public values in the selected EAS environment before building.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "Release client configuration verified (3 public values; values not printed).",
  );
}

function validateSupabaseUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    errors.push(`${supabaseUrlName} is missing.`);
    return;
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    errors.push(`${supabaseUrlName} must be a valid HTTPS origin.`);
    return;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    errors.push(
      `${supabaseUrlName} must be an HTTPS origin without credentials, query, fragment, or path.`,
    );
    return;
  }

  const hostname = url.hostname.toLowerCase();
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
    hostname.endsWith(".localhost")
  ) {
    errors.push(
      `${supabaseUrlName} must not use a placeholder or local-only hostname.`,
    );
  }
}

function validatePublishableKey(value) {
  const trimmed = value?.trim();
  if (
    !trimmed ||
    !/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(trimmed) ||
    /replace|example/i.test(trimmed)
  ) {
    errors.push(
      `${publishableKeyName} must be a non-placeholder sb_publishable_ client key.`,
    );
  }
}

function validateVapidPublicKey(value) {
  const trimmed = value?.trim();
  if (!trimmed || !/^B[A-Za-z0-9_-]{86}$/.test(trimmed)) {
    errors.push(
      `${vapidPublicKeyName} must be a canonical uncompressed P-256 public key.`,
    );
    return;
  }

  try {
    const publicKey = Buffer.from(trimmed, "base64url");
    if (
      publicKey.length !== 65 ||
      publicKey[0] !== 4 ||
      publicKey.toString("base64url") !== trimmed
    ) {
      throw new Error("Invalid VAPID encoding.");
    }

    const keyAgreement = createECDH("prime256v1");
    keyAgreement.setPrivateKey(Buffer.alloc(32, 1));
    keyAgreement.computeSecret(publicKey);
  } catch {
    errors.push(
      `${vapidPublicKeyName} must encode a valid P-256 public point.`,
    );
  }
}
