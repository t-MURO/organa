import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { useAuth } from "../../auth/auth-context";
import { supabase } from "../../auth/supabase";
import { deleteLocalAccountData } from "../../data/delete-local-account-data";
import { contentKeyVault } from "../../security/content-key-vault";

interface DeletionRequest {
  executeAfter: string;
  requestedAt: string;
}

interface AccountLifecycleContextValue {
  cancelDeletion(): Promise<void>;
  deletionRequest: DeletionRequest | null;
  finalizeLocalDeletion(): Promise<void>;
  loading: boolean;
  readOnly: boolean;
  refresh(): Promise<void>;
  requestDeletion(): Promise<void>;
}

const AccountLifecycleContext = createContext<
  AccountLifecycleContextValue | undefined
>(undefined);

export function AccountLifecycleProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [deletionRequest, setDeletionRequest] =
    useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(auth.user));

  async function refresh() {
    if (!auth.user || !supabase || auth.localPreview) {
      setDeletionRequest(null);
      setLoading(false);
      return;
    }

    const result = await supabase
      .from("account_deletion_requests")
      .select("requested_at,execute_after")
      .eq("user_id", auth.user.id)
      .is("cancelled_at", null)
      .is("completed_at", null)
      .maybeSingle();
    if (result.error) throw result.error;
    setDeletionRequest(
      result.data
        ? {
            executeAfter: result.data.execute_after,
            requestedAt: result.data.requested_at,
          }
        : null,
    );
    setLoading(false);
  }

  useEffect(() => {
    setLoading(Boolean(auth.user));
    void refresh().catch(() => setLoading(false));

    const interval = setInterval(() => void refresh(), 30_000);
    const appState =
      Platform.OS === "web"
        ? undefined
        : AppState.addEventListener("change", (state) => {
            if (state === "active") void refresh();
          });
    return () => {
      clearInterval(interval);
      appState?.remove();
    };
  }, [auth.localPreview, auth.user?.id]);

  async function requestDeletion() {
    if (!auth.user || !supabase || auth.localPreview) {
      throw new Error("Account deletion requires a connected account.");
    }
    const result = await supabase.rpc("request_account_deletion");
    if (result.error) throw result.error;
    await refresh();
  }

  async function cancelDeletion() {
    if (!auth.user || !supabase || auth.localPreview) {
      throw new Error("There is no connected deletion request.");
    }
    const result = await supabase.rpc("cancel_account_deletion");
    if (result.error) throw result.error;
    await refresh();
  }

  async function finalizeLocalDeletion() {
    if (!auth.user) return;
    const userId = auth.user.id;
    await Promise.all([
      contentKeyVault.remove(userId),
      deleteLocalAccountData(userId),
    ]);
    await auth.signOut();
  }

  return (
    <AccountLifecycleContext.Provider
      value={{
        cancelDeletion,
        deletionRequest,
        finalizeLocalDeletion,
        loading,
        readOnly: Boolean(deletionRequest),
        refresh,
        requestDeletion,
      }}
    >
      {children}
    </AccountLifecycleContext.Provider>
  );
}

export function useAccountLifecycle() {
  const context = useContext(AccountLifecycleContext);
  if (!context) {
    throw new Error(
      "useAccountLifecycle must be used inside AccountLifecycleProvider.",
    );
  }
  return context;
}
