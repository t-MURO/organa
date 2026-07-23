import {
  type DeviceApprovalEnvelope,
  createKeyHierarchy,
  createRecoveryEnrollmentProof,
  decryptJson,
  encryptJson,
  type ContentKey,
  type EncryptedEnvelope,
  type RecoveryKeyEnvelope,
  unwrapDeviceApproval,
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
  approvalRequest: DeviceApprovalRequest | null;
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
  refreshDeviceApproval(): Promise<void>;
  requestTrustedDeviceApproval(): Promise<void>;
  restoreWithApprovalCode(code: string): Promise<void>;
  restoreWithRecoveryCode(code: string): Promise<void>;
}

export interface DeviceApprovalRequest {
  approved: boolean;
  expiresAt: string;
  requestedAt: string;
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
  const [approvalRequest, setApprovalRequest] =
    useState<DeviceApprovalRequest | null>(null);

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);
      setError("");
      setContentKey(null);
      setRecoveryCode(undefined);
      setRecoveryEnvelope(null);
      setRestoreRequired(false);
      setApprovalRequest(null);
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
        setApprovalRequest(
          await loadDeviceApproval(auth.user.id, nextDevice.id),
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

  useEffect(() => {
    if (
      !restoreRequired ||
      !auth.user ||
      !device ||
      auth.localPreview
    ) {
      return;
    }

    const interval = setInterval(
      () => void refreshDeviceApproval().catch(() => undefined),
      5_000,
    );
    return () => clearInterval(interval);
  }, [auth.localPreview, auth.user?.id, device?.id, restoreRequired]);

  async function confirmRecoverySaved() {
    if (
      !auth.user ||
      !contentKey ||
      !recoveryCode ||
      !recoveryEnvelope ||
      !device ||
      !supabase
    ) {
      throw new Error("Recovery setup is incomplete.");
    }
    setError("");
    const recoveryProof = await createRecoveryEnrollmentProof(recoveryCode);
    const result = await supabase.rpc("enroll_account_key", {
      p_device_id: device.id,
      p_device_name:
        Platform.OS === "web" ? "Web browser" : `${Platform.OS} device`,
      p_device_platform: Platform.OS,
      p_device_proof: device.secret,
      p_key_id: contentKey.id,
      p_recovery_key_envelope: recoveryEnvelope,
      p_recovery_proof: recoveryProof,
    });
    if (result.error) throw result.error;
    await contentKeyVault.set(auth.user.id, contentKey);
    setRecoveryCode(undefined);
  }

  async function restoreWithRecoveryCode(code: string) {
    if (!auth.user || !recoveryEnvelope || !device) {
      throw new Error("Recovery setup is incomplete.");
    }
    setError("");
    const restoredKey = await unwrapContentKey(code, recoveryEnvelope);
    const recoveryProof = await createRecoveryEnrollmentProof(code);
    await registerDevice(device, recoveryProof);
    await contentKeyVault.set(auth.user.id, restoredKey);
    setContentKey(restoredKey);
    setRestoreRequired(false);
  }

  async function requestTrustedDeviceApproval() {
    if (!auth.user || !device || !supabase || auth.localPreview) {
      throw new Error("A connected account is required for device approval.");
    }
    setError("");
    const result = await supabase.rpc("request_device_approval", {
      p_device_id: device.id,
      p_device_proof: device.secret,
      p_name: deviceName(),
      p_platform: Platform.OS,
    });
    if (result.error) throw result.error;
    setApprovalRequest(await loadDeviceApproval(auth.user.id, device.id));
  }

  async function refreshDeviceApproval() {
    if (!auth.user || !device || !supabase || auth.localPreview) {
      setApprovalRequest(null);
      return;
    }
    setApprovalRequest(await loadDeviceApproval(auth.user.id, device.id));
  }

  async function restoreWithApprovalCode(code: string) {
    if (!auth.user || !device || !supabase) {
      throw new Error("Device approval setup is incomplete.");
    }
    setError("");
    const result = await supabase
      .from("device_approvals")
      .select("encrypted_content_key,expires_at,claimed_at")
      .eq("user_id", auth.user.id)
      .eq("device_id", device.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (
      !result.data?.encrypted_content_key ||
      result.data.claimed_at ||
      new Date(result.data.expires_at).getTime() <= Date.now()
    ) {
      throw new Error(
        "The trusted-device approval is unavailable or has expired.",
      );
    }

    const restoredKey = await unwrapDeviceApproval(
      code,
      result.data.encrypted_content_key as DeviceApprovalEnvelope,
      device.id,
    );
    await contentKeyVault.set(auth.user.id, restoredKey);
    const completion = await supabase.rpc("complete_device_approval", {
      p_device_id: device.id,
      p_device_proof: device.secret,
    });
    if (completion.error) {
      await contentKeyVault.remove(auth.user.id);
      throw completion.error;
    }

    setContentKey(restoredKey);
    setApprovalRequest(null);
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
        approvalRequest,
        confirmRecoverySaved,
        contentKey,
        decryptRecord,
        device,
        encryptRecord,
        error,
        loading,
        recoveryCode,
        recoveryEnvelope,
        refreshDeviceApproval,
        requestTrustedDeviceApproval,
        restoreRequired,
        restoreWithApprovalCode,
        restoreWithRecoveryCode,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
}

async function registerDevice(
  device: DeviceIdentity,
  recoveryProof?: string,
) {
  if (!supabase) return;
  const result = await supabase.rpc("register_trusted_device", {
    p_device_id: device.id,
    p_device_proof: device.secret,
    p_name: deviceName(),
    p_platform: Platform.OS,
    p_recovery_proof: recoveryProof ?? null,
  });
  if (result.error) throw result.error;
}

async function loadDeviceApproval(userId: string, deviceId: string) {
  if (!supabase) return null;
  const result = await supabase
    .from("device_approvals")
    .select("requested_at,approved_at,expires_at,claimed_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (
    !result.data ||
    result.data.claimed_at ||
    new Date(result.data.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }
  return {
    approved: Boolean(result.data.approved_at),
    expiresAt: result.data.expires_at,
    requestedAt: result.data.requested_at,
  };
}

function deviceName() {
  return Platform.OS === "web" ? "Web browser" : `${Platform.OS} device`;
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity must be used inside SecurityProvider.");
  }
  return context;
}
