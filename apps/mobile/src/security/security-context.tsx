import {
  createDeviceApprovalExchangeKeyPair,
  createKeyHierarchy,
  createRecoveryEnrollmentProof,
  decryptJson,
  deriveOpaqueRecordId,
  encryptJson,
  type ContentKey,
  type EncryptedEnvelope,
  type RecoveryKeyEnvelope,
  unwrapDeviceApprovalExchange,
  unwrapContentKey,
} from "@organa/crypto";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import { useAuth } from "../auth/auth-context";
import { supabase } from "../auth/supabase";
import { contentKeyVault } from "./content-key-vault";
import { deviceApprovalKeyVault } from "./device-approval-key-vault";
import { getDeviceIdentity, type DeviceIdentity } from "./device-identity";
import {
  parseDeviceApprovalExchangeEnvelope,
  parseRecoveryKeyEnvelope,
} from "./security-envelope-validation";

interface SecurityContextValue {
  approvalRequest: DeviceApprovalRequest | null;
  contentKey: ContentKey | null;
  device: DeviceIdentity | null;
  error: string;
  loading: boolean;
  recoveryCode?: string;
  recoveryEnvelope: RecoveryKeyEnvelope | null;
  restoreRequired: boolean;
  deriveRecordId(
    recordType: string,
    stableValue: string,
  ): Promise<string>;
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
  restoreWithRecoveryCode(code: string): Promise<void>;
}

export interface DeviceApprovalRequest {
  approved: boolean;
  expiresAt: string;
  recipientPublicKey: string;
  requestedAt: string;
}

interface ScopedContentKey {
  key: ContentKey;
  ownerId: string;
}

const localPreviewOwnerId = "local-preview";

const SecurityContext = createContext<SecurityContextValue | undefined>(
  undefined,
);

export function SecurityProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const activeOwnerId = auth.localPreview
    ? localPreviewOwnerId
    : (auth.user?.id ?? null);
  const activeOwnerRef = useRef(activeOwnerId);
  activeOwnerRef.current = activeOwnerId;
  const [scopedContentKey, setScopedContentKey] =
    useState<ScopedContentKey | null>(null);
  const contentKey =
    activeOwnerId && scopedContentKey?.ownerId === activeOwnerId
      ? scopedContentKey.key
      : null;
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string>();
  const [recoveryEnvelope, setRecoveryEnvelope] =
    useState<RecoveryKeyEnvelope | null>(null);
  const [restoreRequired, setRestoreRequired] = useState(false);
  const [approvalRequest, setApprovalRequest] =
    useState<DeviceApprovalRequest | null>(null);
  const approvalClaimRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    const userId = auth.user?.id;
    const ownerId = auth.localPreview ? localPreviewOwnerId : userId;

    async function initialize() {
      setLoading(true);
      setError("");
      setScopedContentKey(null);
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
        setScopedContentKey({
          key: hierarchy.contentKey,
          ownerId: localPreviewOwnerId,
        });
        setLoading(false);
        return;
      }

      if (!userId || !ownerId || !supabase) {
        setLoading(false);
        return;
      }

      const stored = await contentKeyVault.get(userId);
      if (stored) {
        if (!active) return;
        setScopedContentKey({ key: stored.contentKey, ownerId });
        setRecoveryEnvelope(stored.recoveryEnvelope);
        setLoading(false);
        if (!stored.recoveryEnvelope) {
          void loadRecoveryEnvelope(userId, stored.contentKey.id)
            .then(async (nextRecoveryEnvelope) => {
              if (!active) return;
              await contentKeyVault.set(userId, {
                contentKey: stored.contentKey,
                recoveryEnvelope: nextRecoveryEnvelope,
              });
              if (!active) {
                if (activeOwnerRef.current !== userId) {
                  await contentKeyVault.remove(userId);
                }
                return;
              }
              setRecoveryEnvelope(nextRecoveryEnvelope);
            })
            .catch(() => {
              if (active) {
                setError(
                  "Encrypted backup metadata will be refreshed when Organa is online.",
                );
              }
            });
        }
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
        .eq("user_id", userId)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!active) return;

      if (result.data) {
        setRecoveryEnvelope(
          parseRecoveryKeyEnvelope(
            result.data.recovery_key_envelope,
            result.data.key_id,
          ),
        );
        setApprovalRequest(
          await loadDeviceApproval(userId, nextDevice.id),
        );
        setRestoreRequired(true);
        setLoading(false);
        return;
      }

      const hierarchy = await createKeyHierarchy();
      if (!active) return;
      setScopedContentKey({ key: hierarchy.contentKey, ownerId });
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
  }, [auth.localPreview, auth.user?.id]);

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
      () =>
        void refreshDeviceApproval().catch((nextError) => {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The approved device could not be unlocked.",
          );
        }),
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
    if (
      result.error &&
      !(await accountEnrollmentCompleted(
        auth.user.id,
        contentKey.id,
        device.id,
      ))
    ) {
      throw result.error;
    }
    await contentKeyVault.set(auth.user.id, {
      contentKey,
      recoveryEnvelope,
    });
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
    await contentKeyVault.set(auth.user.id, {
      contentKey: restoredKey,
      recoveryEnvelope,
    });
    await deviceApprovalKeyVault.remove(auth.user.id, device.id);
    setScopedContentKey({ key: restoredKey, ownerId: auth.user.id });
    setRestoreRequired(false);
  }

  async function requestTrustedDeviceApproval() {
    if (!auth.user || !device || !supabase || auth.localPreview) {
      throw new Error("A connected account is required for device approval.");
    }
    setError("");
    const keyPair = createDeviceApprovalExchangeKeyPair();
    await deviceApprovalKeyVault.set(auth.user.id, device.id, keyPair);
    const result = await supabase.rpc("request_device_approval", {
      p_device_id: device.id,
      p_device_proof: device.secret,
      p_name: deviceName(),
      p_platform: Platform.OS,
      p_request_public_key: keyPair.publicKey,
    });
    if (result.error) throw result.error;
    setApprovalRequest(await loadDeviceApproval(auth.user.id, device.id));
  }

  async function refreshDeviceApproval() {
    if (!auth.user || !device || !supabase || auth.localPreview) {
      setApprovalRequest(null);
      return;
    }
    const nextRequest = await loadDeviceApproval(
      auth.user.id,
      device.id,
    );
    setApprovalRequest(nextRequest);
    if (nextRequest?.approved) {
      await completeTrustedDeviceApproval();
    }
  }

  async function completeTrustedDeviceApproval() {
    if (!auth.user || !device || !supabase) {
      throw new Error("Device approval setup is incomplete.");
    }
    if (approvalClaimRef.current) return approvalClaimRef.current;

    const userId = auth.user.id;
    const currentDevice = device;
    const claim = (async () => {
      setError("");
      const [result, keyPair] = await Promise.all([
        supabase
          .from("device_approvals")
          .select(
            "encrypted_content_key,request_public_key,expires_at,claimed_at",
          )
          .eq("user_id", userId)
          .eq("device_id", currentDevice.id)
          .maybeSingle(),
        deviceApprovalKeyVault.get(userId, currentDevice.id),
      ]);
      if (result.error) throw result.error;
      if (
        !result.data?.encrypted_content_key ||
        !result.data.request_public_key ||
        result.data.claimed_at ||
        new Date(result.data.expires_at).getTime() <= Date.now()
      ) {
        throw new Error(
          "The trusted-device approval is unavailable or has expired.",
        );
      }
      if (
        !keyPair ||
        keyPair.publicKey !== result.data.request_public_key
      ) {
        throw new Error(
          "This approval belongs to an earlier request. Ask the trusted device again.",
        );
      }

      const restoredKey = await unwrapDeviceApprovalExchange(
        parseDeviceApprovalExchangeEnvelope(
          result.data.encrypted_content_key,
          currentDevice.id,
          keyPair.publicKey,
        ),
        currentDevice.id,
        keyPair,
      );
      const completion = await supabase.rpc("complete_device_approval", {
        p_device_id: currentDevice.id,
        p_device_proof: currentDevice.secret,
      });
      if (
        completion.error &&
        !(await deviceApprovalCompleted(userId, currentDevice.id))
      ) {
        throw completion.error;
      }

      await contentKeyVault.set(userId, {
        contentKey: restoredKey,
        recoveryEnvelope,
      });
      await deviceApprovalKeyVault.remove(userId, currentDevice.id);
      setScopedContentKey({ key: restoredKey, ownerId: userId });
      setApprovalRequest(null);
      setRestoreRequired(false);
    })();
    approvalClaimRef.current = claim;
    try {
      await claim;
    } finally {
      if (approvalClaimRef.current === claim) {
        approvalClaimRef.current = null;
      }
    }
  }

  async function encryptRecord(
    recordType: string,
    recordId: string,
    value: unknown,
  ) {
    if (!contentKey) throw new Error("The account content key is unavailable.");
    return encryptJson(value, contentKey, recordType, recordId);
  }

  async function deriveRecordId(recordType: string, stableValue: string) {
    if (!contentKey) throw new Error("The account content key is unavailable.");
    return deriveOpaqueRecordId(contentKey, recordType, stableValue);
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
        deriveRecordId,
        device,
        encryptRecord,
        error,
        loading,
        recoveryCode,
        recoveryEnvelope,
        refreshDeviceApproval,
        requestTrustedDeviceApproval,
        restoreRequired,
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

async function loadRecoveryEnvelope(userId: string, keyId: string) {
  if (!supabase) {
    throw new Error("A connected account is required.");
  }
  const result = await supabase
    .from("account_keys")
    .select("key_id,recovery_key_envelope")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || result.data.key_id !== keyId) {
    throw new Error("The stored recovery information is unavailable.");
  }
  return parseRecoveryKeyEnvelope(
    result.data.recovery_key_envelope,
    result.data.key_id,
  );
}

async function loadDeviceApproval(userId: string, deviceId: string) {
  if (!supabase) return null;
  const result = await supabase
    .from("device_approvals")
    .select(
      "requested_at,approved_at,expires_at,claimed_at,request_public_key",
    )
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (
    !result.data ||
    !isApprovalPublicKey(result.data.request_public_key) ||
    result.data.claimed_at ||
    new Date(result.data.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }
  return {
    approved: Boolean(result.data.approved_at),
    expiresAt: result.data.expires_at,
    recipientPublicKey: result.data.request_public_key,
    requestedAt: result.data.requested_at,
  };
}

async function accountEnrollmentCompleted(
  userId: string,
  keyId: string,
  deviceId: string,
) {
  if (!supabase) return false;
  const [keyResult, deviceResult] = await Promise.all([
    supabase
      .from("account_keys")
      .select("key_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("devices")
      .select("trusted_at,revoked_at")
      .eq("user_id", userId)
      .eq("id", deviceId)
      .maybeSingle(),
  ]);
  return Boolean(
    !keyResult.error &&
      !deviceResult.error &&
      keyResult.data?.key_id === keyId &&
      deviceResult.data?.trusted_at &&
      !deviceResult.data.revoked_at,
  );
}

async function deviceApprovalCompleted(userId: string, deviceId: string) {
  if (!supabase) return false;
  const [deviceResult, approvalResult] = await Promise.all([
    supabase
      .from("devices")
      .select("trusted_at,revoked_at")
      .eq("user_id", userId)
      .eq("id", deviceId)
      .maybeSingle(),
    supabase
      .from("device_approvals")
      .select("encrypted_content_key,claimed_at")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .maybeSingle(),
  ]);
  return Boolean(
    !deviceResult.error &&
      !approvalResult.error &&
      deviceResult.data?.trusted_at &&
      !deviceResult.data.revoked_at &&
      approvalResult.data?.claimed_at &&
      !approvalResult.data.encrypted_content_key,
  );
}

function deviceName() {
  return Platform.OS === "web" ? "Web browser" : `${Platform.OS} device`;
}

function isApprovalPublicKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity must be used inside SecurityProvider.");
  }
  return context;
}
