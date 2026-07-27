import type { Session, User } from "@supabase/supabase-js";
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
  isSupabaseConfigured,
  supabase,
  supabaseConfigurationIssue,
} from "./supabase";
import {
  clearLocalDevelopmentIdentity,
  createLocalDevelopmentIdentity,
  type LocalDevelopmentIdentity,
  localDevelopmentAuthEnabled,
  readLocalDevelopmentIdentity,
  saveLocalDevelopmentIdentity,
} from "./local-development-auth";

interface AuthContextValue {
  configurationIssue: string;
  configured: boolean;
  loading: boolean;
  localDevelopmentEnabled: boolean;
  localEmail: string | null;
  ownerId: string | null;
  localPreview: boolean;
  session: Session | null;
  user: User | null;
  authError: string;
  clearAuthError(): void;
  isCurrentUser(userId: string): Promise<boolean>;
  signInLocally(email: string): Promise<void>;
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured);
  const [localIdentityLoading, setLocalIdentityLoading] = useState(
    localDevelopmentAuthEnabled,
  );
  const [session, setSession] = useState<Session | null>(null);
  const [localIdentity, setLocalIdentity] =
    useState<LocalDevelopmentIdentity | null>(null);
  const [authError, setAuthError] = useState("");
  const localPreview = localIdentity !== null;
  const visibleSession = localPreview ? null : session;
  const ownerId = localIdentity?.ownerId ?? visibleSession?.user.id ?? null;

  useEffect(() => {
    if (!localDevelopmentAuthEnabled) return;

    let active = true;
    void readLocalDevelopmentIdentity()
      .then((identity) => {
        if (active) setLocalIdentity(identity);
      })
      .catch(() => {
        if (active) setLocalIdentity(null);
      })
      .finally(() => {
        if (active) setLocalIdentityLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (localIdentityLoading) return;
    if (localIdentity) {
      setSession(null);
      setSessionLoading(false);
      return;
    }

    const client = supabase;
    if (!client) {
      setSessionLoading(false);
      return;
    }

    let active = true;
    let authStateChanged = false;
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authStateChanged) return;
        if (error) {
          setAuthError((current) => current || initialSessionErrorMessage);
          setSession(null);
        } else if (!isEmailSession(data.session)) {
          setAuthError(unsupportedSessionErrorMessage);
          setSession(null);
          void client.auth.signOut({ scope: "local" });
        } else {
          setSession(data.session);
        }
        setSessionLoading(false);
      })
      .catch(() => {
        if (!active || authStateChanged) return;
        setAuthError((current) => current || initialSessionErrorMessage);
        setSession(null);
        setSessionLoading(false);
      });

    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authStateChanged = true;
      if (!isEmailSession(nextSession)) {
        setAuthError(unsupportedSessionErrorMessage);
        setSession(null);
        setSessionLoading(false);
        setTimeout(() => {
          void client.auth.signOut({ scope: "local" });
        }, 0);
        return;
      }
      setSession(nextSession);
      setSessionLoading(false);
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
  }, [localIdentity, localIdentityLoading]);

  async function sendEmailCode(email: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
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
    if (localIdentity) return localIdentity.ownerId === userId;
    if (!supabase) return false;
    const result = await supabase.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session?.user.id === userId;
  }

  async function signOut() {
    setAuthError("");
    if (localIdentity) {
      await clearLocalDevelopmentIdentity();
      setLocalIdentity(null);
      setSession(null);
      await clearPrivatePlatformState();
      return;
    }
    setSession(null);
    if (!supabase) {
      await clearPrivatePlatformState();
      return;
    }
    await clearPrivatePlatformState();
    const result = await supabase.auth.signOut({ scope: "local" });
    if (result.error) throw result.error;
  }

  async function signInLocally(email: string) {
    const identity = await createLocalDevelopmentIdentity(email);
    await saveLocalDevelopmentIdentity(identity);
    setAuthError("");
    setSession(null);
    setLocalIdentity(identity);
  }

  return (
    <AuthContext.Provider
      value={{
        authError,
        clearAuthError: () => setAuthError(""),
        configurationIssue: supabaseConfigurationIssue,
        configured: isSupabaseConfigured,
        isCurrentUser,
        loading: sessionLoading || localIdentityLoading,
        localDevelopmentEnabled: localDevelopmentAuthEnabled,
        localEmail: localIdentity?.email ?? null,
        localPreview,
        ownerId,
        session: visibleSession,
        user: visibleSession?.user ?? null,
        signInLocally,
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

const initialSessionErrorMessage =
  "Saved sign-in could not be opened. Please sign in again.";
const unsupportedSessionErrorMessage =
  "This saved sign-in method is no longer supported. Continue with an email verification code.";

function isEmailSession(session: Session | null) {
  return session === null || session.user.app_metadata.provider === "email";
}
