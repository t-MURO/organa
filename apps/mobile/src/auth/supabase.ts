import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";

import { authStorage } from "./auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
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
