import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";

import { authStorage } from "./auth-storage";

export type ConfiguredOAuthProvider = "google" | "github";

const oauthProviderOrder: ConfiguredOAuthProvider[] = ["google", "github"];
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

export async function readConfiguredOAuthProviders() {
  if (!configuration.value) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${configuration.value.url}/auth/v1/settings`, {
      headers: {
        Accept: "application/json",
        apikey: configuration.value.key,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Supabase Auth settings could not be loaded.");
    }

    const settings: unknown = await response.json();
    const external =
      isRecord(settings) && isRecord(settings.external)
        ? settings.external
        : undefined;
    if (!external) {
      throw new Error("Supabase Auth settings were malformed.");
    }
    return oauthProviderOrder.filter(
      (provider) => external[provider] === true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

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
        "Use the managed project's HTTPS URL in the form https://PROJECT_REF.supabase.co.",
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
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) ||
      url.username ||
      url.password ||
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
