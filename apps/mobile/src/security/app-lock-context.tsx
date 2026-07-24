import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { createAppLockAdapter } from "./create-app-lock-adapter";
import {
  loadAppLockState,
  shouldLockForAppState,
} from "./app-lock-state";

interface AppLockContextValue {
  enabled: boolean;
  error: string;
  loading: boolean;
  locked: boolean;
  supported: boolean;
  setEnabled(enabled: boolean): Promise<void>;
  unlock(): Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | undefined>(
  undefined,
);
const adapter = createAppLockAdapter();

export function AppLockProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabledState] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadAppLockState(adapter)
      .then((state) => {
        if (!active) return;
        setSupported(state.supported);
        setEnabledState(state.enabled);
        setLocked(state.locked);
        setError(state.error);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription =
      Platform.OS === "web"
        ? undefined
        : AppState.addEventListener("change", (state) => {
            if (shouldLockForAppState(enabled, state)) setLocked(true);
          });
    return () => {
      subscription?.remove();
    };
  }, [enabled]);

  async function unlock() {
    setError("");
    try {
      if (await adapter.authenticate()) {
        setLocked(false);
        return;
      }
    } catch {
      // The same pressure-free error is used for denial and unavailable APIs.
    }
    setError("Organa stayed locked. You can try again when you are ready.");
  }

  async function setEnabled(nextEnabled: boolean) {
    setError("");
    if (nextEnabled) {
      if (!supported) {
        throw new Error("Device authentication is not available.");
      }
      if (!(await adapter.authenticate())) {
        throw new Error("App lock was not enabled.");
      }
    }
    await adapter.setEnabled(nextEnabled);
    setEnabledState(nextEnabled);
    setLocked(false);
  }

  return (
    <AppLockContext.Provider
      value={{
        enabled,
        error,
        loading,
        locked,
        setEnabled,
        supported,
        unlock,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock must be used inside AppLockProvider.");
  }
  return context;
}
