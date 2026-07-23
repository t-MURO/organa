import {
  createKeyHierarchy,
  decryptJson,
  encryptJson,
  type ContentKey,
  type EncryptedEnvelope,
  type RecoveryKeyEnvelope,
  unwrapContentKey,
} from "@organa/crypto";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";

import { useAuth } from "../auth/auth-context";
import { supabase } from "../auth/supabase";
import { contentKeyVault } from "./content-key-vault";
import { getDeviceIdentity, type DeviceIdentity } from "./device-identity";

interface SecurityContextValue {
  contentKey: ContentKey | null;
  device: DeviceIdentity | null;
  error: string;
  loading: boolean;
  recoveryCode?: string;
  recoveryEnvelope: RecoveryKeyEnvelope | null;
  restoreRequired: boolean;
  encryptRecord(
    recordType: string,
    recordId: string,
    value: unknown,
  ): Promise<EncryptedEnvelope>;
  decryptRecord<T>(
    envelope: EncryptedEnvelope,
    recordType: string,
    recordId: string,
  ): Promise<T>;
  confirmRecoverySaved(): Promise<void>;
  restoreWithRecoveryCode(code: string): Promise<void>;
}

const SecurityContext = createContext<SecurityContextValue | undefined>(
  undefined,
);

export function SecurityProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [contentKey, setContentKey] = useState<ContentKey | null>(null);
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string>();
  const [recoveryEnvelope, setRecoveryEnvelope] =
    useState<RecoveryKeyEnvelope | null>(null);
  const [restoreRequired, setRestoreRequired] = useState(false);

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      setError("");
      setContentKey(null);
      setRecoveryCode(undefined);
      setRecoveryEnvelope(null);
      setRestoreRequired(false);
      const nextDevice = await getDeviceIdentity();
      if (!active) return;
      setDevice(nextDevice);

      if (auth.localPreview) {
        const hierarchy = await createKeyHierarchy();
        if (!active) return;
        setContentKey(hierarchy.contentKey);
        setLoading(false);
        return;
      }

      if (!auth.user || !supabase) {
        setLoading(false);
        return;
      }

      const storedKey = await contentKeyVault.get(auth.user.id);
      if (storedKey) {
        if (!active) return;
        setContentKey(storedKey);
        setLoading(false);
        void registerDevice(nextDevice).catch(() => {
          if (active) {
            setError("Device status will be checked when Organa is online.");
          }
        });
        return;
      }

      const result = await supabase
        .from("account_keys")
        .select("key_id,recovery_key_envelope")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!active) return;

      if (result.data) {
        setRecoveryEnvelope(
          result.data.recovery_key_envelope as RecoveryKeyEnvelope,
        );
        setRestoreRequired(true);
        setLoading(false);
        return;
      }

      const hierarchy = await createKeyHierarchy();
      if (!active) return;
      setContentKey(hierarchy.contentKey);
      setRecoveryCode(hierarchy.recoveryCode);
      setRecoveryEnvelope(hierarchy.recoveryEnvelope);
      setLoading(false);
    }

    void initialize().catch((nextError) => {
      if (!active) return;
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Encryption setup could not be completed.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [auth.localPreview, auth.user]);

  async function confirmRecoverySaved() {
    if (!auth.user || !contentKey || !recoveryEnvelope || !device || !supabase) {
      throw new Error("Recovery setup is incomplete.");
    }
    setError("");
    const result = await supabase.from("account_keys").upsert({
      key_id: contentKey.id,
      recovery_key_envelope: recoveryEnvelope,
      user_id: auth.user.id,
    });
    if (result.error) throw result.error;
    await contentKeyVault.set(auth.user.id, contentKey);
    await registerDevice(device);
    setRecoveryCode(undefined);
  }

  async function restoreWithRecoveryCode(code: string) {
    if (!auth.user || !recoveryEnvelope || !device) {
      throw new Error("Recovery setup is incomplete.");
    }
    setError("");
    const restoredKey = await unwrapContentKey(code, recoveryEnvelope);
    await contentKeyVault.set(auth.user.id, restoredKey);
    await registerDevice(device);
    setContentKey(restoredKey);
    setRestoreRequired(false);
  }

  async function encryptRecord(
    recordType: string,
    recordId: string,
    value: unknown,
  ) {
    if (!contentKey) throw new Error("The account content key is unavailable.");
    return encryptJson(value, contentKey, recordType, recordId);
  }

  async function decryptRecord<T>(
    envelope: EncryptedEnvelope,
    recordType: string,
    recordId: string,
  ) {
    if (!contentKey) throw new Error("The account content key is unavailable.");
    return decryptJson<T>(envelope, contentKey, recordType, recordId);
  }

  return (
    <SecurityContext.Provider
      value={{
        confirmRecoverySaved,
        contentKey,
        decryptRecord,
        device,
        encryptRecord,
        error,
        loading,
        recoveryCode,
        recoveryEnvelope,
        restoreRequired,
        restoreWithRecoveryCode,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
}

async function registerDevice(device: DeviceIdentity) {
  if (!supabase) return;
  const result = await supabase.rpc("register_trusted_device", {
    p_device_id: device.id,
    p_name: Platform.OS === "web" ? "Web browser" : `${Platform.OS} device`,
    p_platform: Platform.OS,
  });
  if (result.error) throw result.error;
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity must be used inside SecurityProvider.");
  }
  return context;
}
