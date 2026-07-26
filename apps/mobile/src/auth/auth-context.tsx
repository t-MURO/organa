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
import {
  createOAuthCallbackCoordinator,
  parseOAuthCallback,
} from "./oauth-callback";
import {
  type ConfiguredOAuthProvider,
  isSupabaseConfigured,
  readConfiguredOAuthProviders,
  supabase,
  supabaseConfigurationIssue,
} from "./supabase";

WebBrowser.maybeCompleteAuthSession();

type OAuthProvider = Extract<Provider, ConfiguredOAuthProvider>;

interface AuthContextValue {
  configurationIssue: string;
  configured: boolean;
  loading: boolean;
  localPreview: boolean;
  oauthProviders: OAuthProvider[];
  oauthProvidersLoading: boolean;
  session: Session | null;
  user: User | null;
  callbackError: string;
  clearCallbackError(): void;
  isCurrentUser(userId: string): Promise<boolean>;
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
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [oauthProvidersLoading, setOauthProvidersLoading] = useState(
    isSupabaseConfigured,
  );
  const [authRedirectUrl] = useState(() => Linking.createURL("/"));
  const [oauthCallbackCoordinator] = useState(() => {
    const client = supabase;
    if (!client) return undefined;
    return createOAuthCallbackCoordinator(authRedirectUrl, async (code) => {
      const result = await client.auth.exchangeCodeForSession(code);
      if (result.error) throw result.error;
    });
  });

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const callback = parseOAuthCallback(
      window.location.href,
      authRedirectUrl,
    );
    if (callback.type !== "error") return;

    setCallbackError(callback.message);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, [authRedirectUrl]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setOauthProvidersLoading(false);
      return;
    }

    let active = true;
    void readConfiguredOAuthProviders()
      .then((providers) => {
        if (active) setOauthProviders(providers);
      })
      .catch(() => {
        if (active) setOauthProviders([]);
      })
      .finally(() => {
        if (active) setOauthProvidersLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    let active = true;
    let authStateChanged = false;
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authStateChanged) return;
        if (error) {
          setCallbackError((current) => current || initialSessionErrorMessage);
          setSession(null);
        } else {
          setSession(data.session);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active || authStateChanged) return;
        setCallbackError((current) => current || initialSessionErrorMessage);
        setSession(null);
        setLoading(false);
      });

    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      authStateChanged = true;
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
        redirectTo: authRedirectUrl,
        skipBrowserRedirect: Platform.OS !== "web",
      },
    });
    if (error) throw error;
    if (Platform.OS === "web") return;
    if (!data.url) throw new Error("The sign-in provider did not return a URL.");

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      authRedirectUrl,
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
      options: {
        emailRedirectTo: authRedirectUrl,
        shouldCreateUser: true,
      },
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

  async function isCurrentUser(userId: string) {
    if (!supabase) return false;
    const result = await supabase.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session?.user.id === userId;
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
        isCurrentUser,
        loading,
        localPreview,
        oauthProviders,
        oauthProvidersLoading,
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

const initialSessionErrorMessage =
  "Saved sign-in could not be opened. Please sign in again.";
