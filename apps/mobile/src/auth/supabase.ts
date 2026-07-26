import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";

import { authStorage } from "./auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const configuration = readSupabaseConfiguration(
  supabaseUrl,
  supabasePublishableKey,
);

export const isSupabaseConfigured = Boolean(configuration.value);
export const supabaseConfigurationIssue = configuration.issue;

export const supabase = isSupabaseConfigured
  ? createClient(configuration.value!.url, configuration.value!.key, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: typeof window !== "undefined",
        flowType: "pkce",
        lock: processLock,
        persistSession: true,
        storage: authStorage,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : undefined;

function readSupabaseConfiguration(
  urlValue: string | undefined,
  keyValue: string | undefined,
) {
  if (!urlValue || !keyValue) {
    return {
      issue:
        "Add both public Supabase values from .env.example before creating an account.",
    };
  }

  const url = parseSupabaseUrl(urlValue);
  if (!url) {
    return {
      issue:
        "Use an HTTPS Supabase project URL. Loopback HTTP is supported only for local development.",
    };
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(keyValue)) {
    return {
      issue:
        "Use the project's sb_publishable_ key. Secret and service-role keys are not accepted by the app.",
    };
  }

  return {
    issue: "",
    value: { key: keyValue, url: url.toString().replace(/\/$/, "") },
  };
}

function parseSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    const allowedProtocol =
      url.protocol === "https:" || (url.protocol === "http:" && loopback);
    if (
      !allowedProtocol ||
      url.username ||
      url.password ||
      url.hostname.includes("your-project-ref") ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}
