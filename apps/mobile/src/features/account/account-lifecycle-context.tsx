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
import { useSecurity } from "../../security/security-context";
import { accountDeletionCache } from "./account-deletion-cache";
import { eraseLocalAccount } from "./erase-local-account";
import { reminderAuthorizationCache } from "./reminder-authorization-cache";

interface DeletionRequest {
  executeAfter: string;
  requestedAt: string;
}

interface ScopedDeletionRequest {
  request: DeletionRequest | null;
  userId: string;
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
  const security = useSecurity();
  const userId = auth.user?.id;
  const [scopedDeletionRequest, setScopedDeletionRequest] =
    useState<ScopedDeletionRequest | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const deletionRequest =
    userId && scopedDeletionRequest?.userId === userId
      ? scopedDeletionRequest.request
      : null;
  const loading =
    Boolean(userId) && !auth.localPreview && resolvedUserId !== userId;

  async function refresh() {
    const refreshUserId = auth.user?.id;
    if (!refreshUserId || !supabase || auth.localPreview) {
      setScopedDeletionRequest(null);
      setResolvedUserId(null);
      return;
    }

    const result = await supabase
      .from("account_deletion_requests")
      .select("requested_at,execute_after")
      .eq("user_id", refreshUserId)
      .is("cancelled_at", null)
      .is("completed_at", null)
      .maybeSingle();
    if (result.error) throw result.error;
    const nextRequest = result.data
      ? {
          executeAfter: result.data.execute_after,
          requestedAt: result.data.requested_at,
        }
      : null;
    setScopedDeletionRequest({
      request: nextRequest,
      userId: refreshUserId,
    });
    if (nextRequest) {
      await accountDeletionCache.set(refreshUserId, nextRequest);
    } else {
      await accountDeletionCache.remove(refreshUserId);
    }
    setResolvedUserId(refreshUserId);
  }

  useEffect(() => {
    let active = true;
    const initializeUserId = auth.user?.id;

    async function initialize() {
      if (!initializeUserId || auth.localPreview) {
        if (active) {
          setScopedDeletionRequest(null);
          setResolvedUserId(null);
        }
        return;
      }

      setResolvedUserId(null);
      const cached = await accountDeletionCache.get(initializeUserId);
      if (!active) return;
      setScopedDeletionRequest({
        request: cached,
        userId: initializeUserId,
      });
      setResolvedUserId(initializeUserId);
      void refresh().catch(() => undefined);
    }

    void initialize().catch(() => {
      if (active) setResolvedUserId(initializeUserId ?? null);
    });

    const interval = setInterval(
      () => void refresh().catch(() => undefined),
      30_000,
    );
    const appState =
      Platform.OS === "web"
        ? undefined
        : AppState.addEventListener("change", (state) => {
            if (state === "active") {
              void refresh().catch(() => undefined);
            }
          });
    return () => {
      active = false;
      clearInterval(interval);
      appState?.remove();
    };
  }, [auth.localPreview, auth.user?.id]);

  async function requestDeletion() {
    if (!auth.user || !security.device || !supabase || auth.localPreview) {
      throw new Error("Account deletion requires a connected account.");
    }
    const result = await supabase.rpc("request_account_deletion", {
      p_device_id: security.device.id,
      p_device_proof: security.device.secret,
    });
    if (result.error) throw result.error;
    await refresh();
  }

  async function cancelDeletion() {
    if (!auth.user || !security.device || !supabase || auth.localPreview) {
      throw new Error("There is no connected deletion request.");
    }
    const result = await supabase.rpc("cancel_account_deletion", {
      p_device_id: security.device.id,
      p_device_proof: security.device.secret,
    });
    if (result.error) throw result.error;
    await refresh();
  }

  async function finalizeLocalDeletion() {
    if (!auth.user) return;
    const userId = auth.user.id;
    await eraseLocalAccount(
      userId,
      auth.signOut,
      () => reminderAuthorizationCache.remove(userId),
    );
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
