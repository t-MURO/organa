import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
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
  due: boolean | null;
  executeAfter: string;
  requestedAt: string;
}

type RemoteDeletionStatus =
  | { state: "deleted" }
  | { state: "none" }
  | {
      due: boolean;
      executeAfter: string;
      requestedAt: string;
      state: "pending";
    };

interface ScopedDeletionRequest {
  request: DeletionRequest | null;
  userId: string;
}

interface AccountLifecycleContextValue {
  cancelDeletion(): Promise<void>;
  deletionRequest: DeletionRequest | null;
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
  const erasingUserId = useRef<string | null>(null);
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

    const result = await supabase.rpc("get_account_deletion_status");
    if (result.error) throw result.error;
    const status = parseRemoteDeletionStatus(result.data);
    if (
      status.state === "deleted" ||
      (status.state === "pending" && status.due)
    ) {
      await finalizeLocalDeletion();
      return;
    }
    const nextRequest =
      status.state === "pending"
        ? {
            due: status.due,
            executeAfter: status.executeAfter,
            requestedAt: status.requestedAt,
          }
        : null;
    setScopedDeletionRequest({
      request: nextRequest,
      userId: refreshUserId,
    });
    if (nextRequest) {
      await accountDeletionCache.set(refreshUserId, {
        executeAfter: nextRequest.executeAfter,
        requestedAt: nextRequest.requestedAt,
      });
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
        request: cached ? { ...cached, due: null } : null,
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
    if (erasingUserId.current === userId) return;
    erasingUserId.current = userId;
    try {
      await eraseLocalAccount(
        userId,
        () => auth.isCurrentUser(userId),
        auth.signOut,
        () => reminderAuthorizationCache.remove(userId),
      );
    } catch (error) {
      erasingUserId.current = null;
      throw error;
    }
  }

  return (
    <AccountLifecycleContext.Provider
      value={{
        cancelDeletion,
        deletionRequest,
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

function parseRemoteDeletionStatus(value: unknown): RemoteDeletionStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The account deletion status is invalid.");
  }
  const status = value as Record<string, unknown>;
  if (status.state === "deleted" || status.state === "none") {
    return { state: status.state };
  }
  if (
    status.state !== "pending" ||
    typeof status.due !== "boolean" ||
    typeof status.executeAfter !== "string" ||
    !Number.isFinite(new Date(status.executeAfter).getTime()) ||
    typeof status.requestedAt !== "string" ||
    !Number.isFinite(new Date(status.requestedAt).getTime())
  ) {
    throw new Error("The account deletion status is invalid.");
  }
  return {
    due: status.due,
    executeAfter: status.executeAfter,
    requestedAt: status.requestedAt,
    state: "pending",
  };
}
