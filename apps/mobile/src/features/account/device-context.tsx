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
import { deleteLocalAccountData } from "../../data/delete-local-account-data";
import { contentKeyVault } from "../../security/content-key-vault";
import { useSecurity } from "../../security/security-context";

export interface TrustedDevice {
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
  remindersAllowed: boolean;
  configureReminders(
    deviceId: string,
    options: { makePrimary?: boolean; notificationsEnabled: boolean },
  ): Promise<void>;
  refresh(): Promise<void>;
  revoke(deviceId: string): Promise<void>;
}

const DeviceContext = createContext<DeviceContextValue | undefined>(undefined);

export function DeviceProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const security = useSecurity();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(!auth.localPreview);
  const revocationHandled = useRef(false);

  async function refresh() {
    if (auth.localPreview || !auth.user || !supabase) {
      setDevices([]);
      setLoading(false);
      return;
    }
    const result = await supabase
      .from("devices")
      .select(
        "id,name,platform,trusted_at,revoked_at,primary_reminder,notifications_enabled,last_seen_at",
      )
      .eq("user_id", auth.user.id)
      .order("last_seen_at", { ascending: false });
    if (result.error) throw result.error;
    setDevices(
      result.data.map((row) => ({
        id: row.id,
        lastSeenAt: row.last_seen_at,
        name: row.name,
        notificationsEnabled: row.notifications_enabled,
        platform: row.platform,
        primaryReminder: row.primary_reminder,
        revokedAt: row.revoked_at,
        trustedAt: row.trusted_at,
      })),
    );
    setLoading(false);
  }

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

  const current = devices.find((item) => item.id === security.device?.id);

  useEffect(() => {
    if (!auth.user || !current?.revokedAt || revocationHandled.current) return;
    revocationHandled.current = true;
    const userId = auth.user.id;
    void Promise.all([
      contentKeyVault.remove(userId),
      deleteLocalAccountData(userId),
    ])
      .then(() => auth.signOut())
      .catch(() => {
        revocationHandled.current = false;
      });
  }, [auth.user?.id, current?.revokedAt]);

  useEffect(() => {
    revocationHandled.current = false;
  }, [auth.user?.id]);

  const remindersAllowed =
    auth.localPreview ||
    Boolean(
      current &&
        !current.revokedAt &&
        (current.primaryReminder || current.notificationsEnabled),
    );

  return (
    <DeviceContext.Provider
      value={{
        configureReminders,
        currentDeviceId: security.device?.id ?? null,
        devices,
        loading,
        refresh,
        remindersAllowed,
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
