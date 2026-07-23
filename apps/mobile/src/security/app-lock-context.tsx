import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { createAppLockAdapter } from "./create-app-lock-adapter";

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
    void Promise.all([adapter.isSupported(), adapter.getEnabled()])
      .then(([nextSupported, nextEnabled]) => {
        if (!active) return;
        setSupported(nextSupported);
        setEnabledState(nextEnabled && nextSupported);
        setLocked(nextEnabled && nextSupported);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const subscription =
      Platform.OS === "web"
        ? undefined
        : AppState.addEventListener("change", (state) => {
            if (state !== "active" && enabled) setLocked(true);
          });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled]);

  async function unlock() {
    setError("");
    if (await adapter.authenticate()) {
      setLocked(false);
      return;
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
