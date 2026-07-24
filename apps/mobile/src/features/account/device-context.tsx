import { createDeviceApproval } from "@organa/crypto";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "../../auth/auth-context";
import { supabase } from "../../auth/supabase";
import { activateNotificationOwner } from "../../data/notification-private-state";
import { useSecurity } from "../../security/security-context";
import { eraseLocalAccount } from "./erase-local-account";
import { reminderAuthorizationCache } from "./reminder-authorization-cache";
import { resolveReminderAuthorization } from "./reminder-authorization";

export interface TrustedDevice {
  approvalExpiresAt?: string;
  approvalRequestedAt?: string;
  id: string;
  lastSeenAt: string;
  name: string;
  notificationsEnabled: boolean;
  platform: string;
  primaryReminder: boolean;
  revokedAt: string | null;
  trustedAt: string | null;
}

interface DeviceContextValue {
  currentDeviceId: string | null;
  devices: TrustedDevice[];
  loading: boolean;
  reminderAuthorizationReady: boolean;
  remindersAllowed: boolean;
  approve(deviceId: string): Promise<string>;
  configureReminders(
    deviceId: string,
    options: { makePrimary?: boolean; notificationsEnabled: boolean },
  ): Promise<void>;
  refresh(): Promise<void>;
  rejectApproval(deviceId: string): Promise<void>;
  revoke(deviceId: string): Promise<void>;
}

const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

export function DeviceProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const security = useSecurity();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(!auth.localPreview);
  const [devicesUserId, setDevicesUserId] = useState<string | null>(null);
  const [cachedAuthorization, setCachedAuthorization] = useState<{
    allowed: boolean | null;
    userId: string;
  } | null>(null);
  const [remoteResolvedUserId, setRemoteResolvedUserId] = useState<
    string | null
  >(null);
  const localErasureHandled = useRef(false);
  const notificationOwnerId = auth.localPreview
    ? "local-preview"
    : auth.user?.id;

  useEffect(
    () =>
      notificationOwnerId
        ? activateNotificationOwner(notificationOwnerId)
        : undefined,
    [notificationOwnerId],
  );

  async function refresh() {
    if (auth.localPreview || !auth.user || !supabase) {
      setDevices([]);
      setDevicesUserId(null);
      setLoading(false);
      setRemoteResolvedUserId(null);
      return;
    }
    const [result, approvals] = await Promise.all([
      supabase
        .from("devices")
        .select(
          "id,name,platform,trusted_at,revoked_at,primary_reminder,notifications_enabled,last_seen_at",
        )
        .eq("user_id", auth.user.id)
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("device_approvals")
        .select("device_id,requested_at,expires_at,claimed_at")
        .eq("user_id", auth.user.id)
        .is("claimed_at", null)
        .gt("expires_at", new Date().toISOString()),
    ]);
    if (result.error) throw result.error;
    if (approvals.error) throw approvals.error;
    const approvalByDevice = new Map(
      approvals.data.map((approval) => [
        approval.device_id,
        approval,
      ]),
    );
    setDevices(
      result.data.map((row) => {
        const approval = approvalByDevice.get(row.id);
        return {
          approvalExpiresAt: approval?.expires_at,
          approvalRequestedAt: approval?.requested_at,
          id: row.id,
          lastSeenAt: row.last_seen_at,
          name: row.name,
          notificationsEnabled: row.notifications_enabled,
          platform: row.platform,
          primaryReminder: row.primary_reminder,
          revokedAt: row.revoked_at,
          trustedAt: row.trusted_at,
        };
      }),
    );
    setDevicesUserId(auth.user.id);
    setRemoteResolvedUserId(auth.user.id);
    setLoading(false);
  }

  useEffect(() => {
    setRemoteResolvedUserId(null);
    setCachedAuthorization(null);

    if (auth.localPreview) return;
    if (!auth.user || !security.device) {
      return;
    }

    let active = true;
    const userId = auth.user.id;
    void reminderAuthorizationCache
      .get(userId)
      .then((allowed) => {
        if (!active) return;
        setCachedAuthorization({ allowed, userId });
      })
      .catch(() => {
        if (!active) return;
        setCachedAuthorization({ allowed: null, userId });
      });
    return () => {
      active = false;
    };
  }, [auth.localPreview, auth.user?.id, security.device?.id]);

  useEffect(() => {
    setLoading(!auth.localPreview);
    void refresh().catch(() => setLoading(false));
    if (!supabase || !auth.user) return;

    const client = supabase;
    const userId = auth.user.id;
    let active = true;
    let channel: ReturnType<typeof client.channel> | undefined;
    void client.realtime.setAuth().then(() => {
      if (!active) return;
      channel = client
        .channel(`organa:${userId}:devices`, {
          config: { private: true },
        })
        .on("broadcast", { event: "changed" }, () => void refresh())
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void client.removeChannel(channel);
    };
  }, [auth.localPreview, auth.user?.id, security.device?.id]);

  async function configureReminders(
    deviceId: string,
    options: { makePrimary?: boolean; notificationsEnabled: boolean },
  ) {
    if (!supabase || !security.device || auth.localPreview) return;
    const result = await supabase.rpc("configure_reminder_device", {
      p_current_device_id: security.device.id,
      p_current_device_proof: security.device.secret,
      p_device_id: deviceId,
      p_make_primary: options.makePrimary ?? false,
      p_notifications_enabled: options.notificationsEnabled,
    });
    if (result.error) throw result.error;
    await refresh();
  }

  async function approve(deviceId: string) {
    if (
      !supabase ||
      !security.device ||
      !security.contentKey ||
      auth.localPreview
    ) {
      throw new Error("A trusted connected device is required.");
    }
    const approval = await createDeviceApproval(
      security.contentKey,
      deviceId,
    );
    const result = await supabase.rpc("approve_trusted_device", {
      p_current_device_id: security.device.id,
      p_current_device_proof: security.device.secret,
      p_encrypted_content_key: approval.envelope,
      p_target_device_id: deviceId,
    });
    if (result.error) throw result.error;
    await refresh();
    return approval.approvalCode;
  }

  async function rejectApproval(deviceId: string) {
    if (!supabase || !security.device || auth.localPreview) return;
    const result = await supabase.rpc("reject_device_approval", {
      p_current_device_id: security.device.id,
      p_current_device_proof: security.device.secret,
      p_target_device_id: deviceId,
    });
    if (result.error) throw result.error;
    await refresh();
  }

  async function revoke(deviceId: string) {
    if (!supabase || !security.device || auth.localPreview) return;
    const result = await supabase.rpc("revoke_trusted_device", {
      p_current_device_id: security.device.id,
      p_current_device_proof: security.device.secret,
      p_target_device_id: deviceId,
    });
    if (result.error) throw result.error;
    const signOutResult = await supabase.auth.signOut({ scope: "others" });
    if (signOutResult.error) throw signOutResult.error;
    await refresh();
  }

  const userId = auth.user?.id;
  const visibleDevices =
    userId && devicesUserId === userId ? devices : [];
  const current = visibleDevices.find(
    (item) => item.id === security.device?.id,
  );
  const remoteResolved =
    Boolean(userId) && remoteResolvedUserId === userId;
  const cacheLoaded =
    Boolean(userId) && cachedAuthorization?.userId === userId;
  const cachedAllowed = cacheLoaded
    ? (cachedAuthorization?.allowed ?? null)
    : null;
  const reminderAuthorization = resolveReminderAuthorization({
    cacheLoaded,
    cachedAllowed,
    currentDevice: current,
    localPreview: auth.localPreview,
    remoteResolved,
  });

  useEffect(() => {
    if (auth.localPreview || !auth.user || !remoteResolved) return;
    const allowed = Boolean(
      current &&
        !current.revokedAt &&
        (current.primaryReminder || current.notificationsEnabled),
    );
    setCachedAuthorization({ allowed, userId: auth.user.id });
    void reminderAuthorizationCache.set(auth.user.id, allowed);
  }, [
    auth.localPreview,
    auth.user?.id,
    current?.notificationsEnabled,
    current?.primaryReminder,
    current?.revokedAt,
    remoteResolved,
  ]);

  useEffect(() => {
    if (
      !auth.user ||
      !security.device ||
      !remoteResolved ||
      devicesUserId !== auth.user.id ||
      localErasureHandled.current ||
      (current?.trustedAt && !current.revokedAt)
    ) {
      return;
    }
    localErasureHandled.current = true;
    const userId = auth.user.id;
    void eraseLocalAccount(
      userId,
      () => auth.isCurrentUser(userId),
      auth.signOut,
      () => reminderAuthorizationCache.remove(userId),
    ).catch(() => {
      localErasureHandled.current = false;
    });
  }, [
    auth.user?.id,
    current?.revokedAt,
    current?.trustedAt,
    devicesUserId,
    remoteResolved,
    security.device?.id,
  ]);

  useEffect(() => {
    localErasureHandled.current = false;
  }, [auth.user?.id]);

  return (
    <DeviceContext.Provider
      value={{
        approve,
        configureReminders,
        currentDeviceId: security.device?.id ?? null,
        devices: visibleDevices,
        loading,
        reminderAuthorizationReady: reminderAuthorization.ready,
        refresh,
        rejectApproval,
        remindersAllowed: reminderAuthorization.allowed,
        revoke,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevices() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDevices must be used inside DeviceProvider.");
  }
  return context;
}
