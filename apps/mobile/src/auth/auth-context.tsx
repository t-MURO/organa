import type { Provider, Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { clearPrivatePlatformState } from "../data/clear-private-platform-state";
import { createOAuthCallbackCoordinator } from "./oauth-callback";
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigurationIssue,
} from "./supabase";

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = Extract<Provider, "google" | "apple" | "github">;

interface AuthContextValue {
  configurationIssue: string;
  configured: boolean;
  loading: boolean;
  localPreview: boolean;
  session: Session | null;
  user: User | null;
  callbackError: string;
  clearCallbackError(): void;
  startLocalPreview(): void;
  signInWithOAuth(provider: OAuthProvider): Promise<void>;
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [localPreview, setLocalPreview] = useState(false);
  const [callbackError, setCallbackError] = useState("");
  const [oauthRedirectUrl] = useState(() => Linking.createURL("/"));
  const [oauthCallbackCoordinator] = useState(() => {
    const client = supabase;
    if (!client) return undefined;
    return createOAuthCallbackCoordinator(oauthRedirectUrl, async (code) => {
      const result = await client.auth.exchangeCodeForSession(code);
      if (result.error) throw result.error;
    });
  });

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (event === "SIGNED_OUT") {
        void clearPrivatePlatformState();
      }
    });

    const appStateSubscription =
      Platform.OS === "web"
        ? undefined
        : AppState.addEventListener("change", (state) => {
            if (state === "active") {
              client.auth.startAutoRefresh();
            } else {
              client.auth.stopAutoRefresh();
            }
          });

    return () => {
      active = false;
      data.subscription.unsubscribe();
      appStateSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const coordinator = oauthCallbackCoordinator;
    if (!coordinator) return;

    let active = true;
    const handleCallback = async (url: string | null) => {
      if (!url) return;
      try {
        const handled = await coordinator.handle(url);
        if (active && handled) setCallbackError("");
      } catch (error) {
        if (active) setCallbackError(oauthCallbackMessage(error));
      }
    };

    void Linking.getInitialURL()
      .then(handleCallback)
      .catch(() => {
        if (active) {
          setCallbackError(
            "The sign-in response could not be opened. Please try again.",
          );
        }
      });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleCallback(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [oauthCallbackCoordinator]);

  async function signInWithOAuth(provider: OAuthProvider) {
    if (!supabase) throw new Error("Supabase is not configured.");
    setCallbackError("");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthRedirectUrl,
        skipBrowserRedirect: Platform.OS !== "web",
      },
    });
    if (error) throw error;
    if (Platform.OS === "web") return;
    if (!data.url) throw new Error("The sign-in provider did not return a URL.");

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      oauthRedirectUrl,
    );
    if (result.type !== "success") return;
    if (!oauthCallbackCoordinator) {
      throw new Error("Sign-in could not be completed. Please try again.");
    }
    try {
      const handled = await oauthCallbackCoordinator.handle(result.url);
      if (!handled) {
        throw new Error("Sign-in could not be completed. Please try again.");
      }
    } catch (error) {
      throw new Error(oauthCallbackMessage(error));
    }
  }

  async function sendEmailCode(email: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (result.error) throw result.error;
  }

  async function verifyEmailCode(email: string, code: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (result.error) throw result.error;
  }

  async function signOut() {
    setLocalPreview(false);
    setCallbackError("");
    setSession(null);
    if (!supabase) {
      await clearPrivatePlatformState();
      return;
    }
    await clearPrivatePlatformState();
    const result = await supabase.auth.signOut({ scope: "local" });
    if (result.error) throw result.error;
  }

  return (
    <AuthContext.Provider
      value={{
        callbackError,
        clearCallbackError: () => setCallbackError(""),
        configurationIssue: supabaseConfigurationIssue,
        configured: isSupabaseConfigured,
        loading,
        localPreview,
        session,
        user: session?.user ?? null,
        startLocalPreview: () => setLocalPreview(true),
        signInWithOAuth,
        sendEmailCode,
        verifyEmailCode,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

function oauthCallbackMessage(error: unknown) {
  return error instanceof Error && error.message === "Sign-in was cancelled."
    ? error.message
    : "Sign-in could not be completed. Please try again.";
}
