import type { EncryptedEnvelope } from "@organa/crypto";
import { randomUUID } from "expo-crypto";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { useAuth } from "../auth/auth-context";
import { supabase } from "../auth/supabase";
import { createSyncOutboxRepository } from "../data/create-sync-outbox-repository";
import type {
  EncryptedFieldPatch,
  EncryptedMutation,
  SyncRecordType,
} from "../data/sync-outbox.types";
import { useSecurity } from "../security/security-context";
import { asRecord, changedFieldNames } from "./field-merge";

export interface RemoteRecordChange<T = unknown> {
  operation: "upsert" | "delete";
  recordId: string;
  recordType: SyncRecordType;
  value?: T;
}

interface SyncContextValue {
  error: string;
  lastSyncedAt?: string;
  pending: number;
  status: "local" | "offline" | "syncing" | "synced" | "error";
  flush(): Promise<void>;
  queueDelete(recordType: SyncRecordType, recordId: string): Promise<void>;
  queueUpsert(
    recordType: SyncRecordType,
    recordId: string,
    value: unknown,
    previousValue?: unknown,
  ): Promise<void>;
  subscribe<T>(
    recordType: SyncRecordType,
    listener: (change: RemoteRecordChange<T>) => void,
  ): () => void;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

interface EncryptedRecordRow {
  ciphertext: EncryptedEnvelope | EncryptedFieldPatch | null;
  deleted: boolean;
  record_id: string;
  record_type: SyncRecordType;
  updated_at?: string;
  updated_by: string;
  version: number;
}

interface EncryptedRecordSignal {
  recordId?: unknown;
  recordType?: unknown;
}

const syncRecordTypes = new Set<SyncRecordType>([
  "task",
  "brain_dump_bullet",
  "brain_dump_update",
  "check_in",
  "template",
  "settings",
]);
const syncPageSize = 250;
const initialSyncCursor = "1970-01-01T00:00:00.000Z";

export function SyncProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const security = useSecurity();
  const namespace = auth.user?.id ?? "local-preview";
  const repository = useMemo(
    () => createSyncOutboxRepository(namespace),
    [namespace],
  );
  const subscribers = useRef(
    new Map<SyncRecordType, Set<(change: RemoteRecordChange) => void>>(),
  );
  const flushing = useRef(false);
  const reconciling = useRef(false);
  const reconciliationCursor = useRef(initialSyncCursor);
  const [pending, setPending] = useState(0);
  const [outboxStatus, setOutboxStatus] =
    useState<SyncContextValue["status"]>("local");
  const [outboxError, setOutboxError] = useState("");
  const [readError, setReadError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();

  useEffect(() => {
    let active = true;
    void repository.initialize().then(async () => {
      const mutations = await repository.list();
      if (!active) return;
      setPending(mutations.length);
      if (auth.user) void flush();
    });

    const interval = setInterval(() => {
      if (auth.user) void flush();
    }, 5_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [auth.user, repository]);

  useEffect(() => {
    const client = supabase;
    if (!auth.user || !client || !security.contentKey) return;

    const userId = auth.user.id;
    let active = true;
    let channel: ReturnType<typeof client.channel> | undefined;
    reconciliationCursor.current = initialSyncCursor;

    void client.realtime.setAuth().then(() => {
      if (!active) return;
      channel = client
        .channel(`organa:${userId}:encrypted-records`, {
          config: { private: true },
        })
        .on("broadcast", { event: "changed" }, ({ payload }) => {
          const signal = payload as EncryptedRecordSignal;
          if (
            typeof signal.recordId !== "string" ||
            !isSyncRecordType(signal.recordType)
          ) {
            return;
          }
          void pullRecord(signal.recordType, signal.recordId);
        })
        .subscribe((channelStatus) => {
          if (channelStatus === "SUBSCRIBED") void reconcile();
        });
    });

    const reconciliationInterval = setInterval(() => void reconcile(), 30_000);
    const appStateSubscription = AppState.addEventListener(
      "change",
      (appState) => {
        if (appState === "active") void reconcile();
      },
    );

    return () => {
      active = false;
      clearInterval(reconciliationInterval);
      appStateSubscription.remove();
      if (channel) void client.removeChannel(channel);
    };
  }, [auth.user, security.contentKey?.id]);

  async function queueUpsert(
    recordType: SyncRecordType,
    recordId: string,
    value: unknown,
    previousValue?: unknown,
  ) {
    if (!auth.user || !security.device) return;
    const timestamp = new Date().toISOString();
    const nextRecord = asRecord(value);
    const changedFields = changedFieldNames(previousValue, value);
    if (changedFields.length === 0) return;
    const ciphertext: EncryptedFieldPatch = {};
    const fieldVersions: Record<string, string> = {};
    for (const field of changedFields) {
      ciphertext[field] = await security.encryptRecord(
        recordType,
        `${recordId}:${field}`,
        Object.prototype.hasOwnProperty.call(nextRecord, field)
          ? { present: true, value: nextRecord[field] }
          : { present: false },
      );
      fieldVersions[field] = timestamp;
    }
    await enqueue({
      attempts: 0,
      baseVersion: 0,
      ciphertext,
      createdAt: timestamp,
      deviceId: security.device.id,
      fieldVersions,
      id: randomUUID(),
      operation: "upsert",
      recordId,
      recordType,
      userId: auth.user.id,
    });
  }

  async function queueDelete(
    recordType: SyncRecordType,
    recordId: string,
  ) {
    if (!auth.user || !security.device) return;
    const timestamp = new Date().toISOString();
    await enqueue({
      attempts: 0,
      baseVersion: 0,
      createdAt: timestamp,
      deviceId: security.device.id,
      fieldVersions: { deleted: timestamp },
      id: randomUUID(),
      operation: "delete",
      recordId,
      recordType,
      userId: auth.user.id,
    });
  }

  async function enqueue(mutation: EncryptedMutation) {
    await repository.upsert(mutation);
    const mutations = await repository.list();
    setPending(mutations.length);
    void flush();
  }

  async function flush() {
    if (flushing.current || !auth.user || !supabase || !security.device) return;
    flushing.current = true;
    setOutboxStatus("syncing");
    setOutboxError("");
    try {
      const mutations = await repository.list();
      for (const mutation of mutations) {
        const result = await supabase.rpc("apply_encrypted_mutation", {
          p_base_version: mutation.baseVersion,
          p_ciphertext: mutation.ciphertext ?? null,
          p_created_at: mutation.createdAt,
          p_device_id: mutation.deviceId,
          p_device_proof: security.device.secret,
          p_field_versions: mutation.fieldVersions,
          p_mutation_id: mutation.id,
          p_operation: mutation.operation,
          p_record_id: mutation.recordId,
          p_record_type: mutation.recordType,
        });
        if (result.error) {
          await repository.upsert({
            ...mutation,
            attempts: mutation.attempts + 1,
          });
          throw result.error;
        }
        await repository.remove(mutation.id);
      }
      const remaining = await repository.list();
      setPending(remaining.length);
      setLastSyncedAt(new Date().toISOString());
      setOutboxStatus(remaining.length === 0 ? "synced" : "offline");
    } catch (nextError) {
      setOutboxStatus("offline");
      setOutboxError(
        nextError instanceof Error
          ? nextError.message
          : "Encrypted changes are waiting to sync.",
      );
      setPending((await repository.list()).length);
    } finally {
      flushing.current = false;
    }
  }

  function subscribe<T>(
    recordType: SyncRecordType,
    listener: (change: RemoteRecordChange<T>) => void,
  ) {
    const listeners =
      subscribers.current.get(recordType) ??
      new Set<(change: RemoteRecordChange) => void>();
    const untypedListener = listener as (
      change: RemoteRecordChange,
    ) => void;
    listeners.add(untypedListener);
    subscribers.current.set(recordType, listeners);
    void pullRecordType(recordType, untypedListener);
    return () => {
      listeners.delete(untypedListener);
    };
  }

  async function pullRecordType(
    recordType: SyncRecordType,
    listener: (change: RemoteRecordChange) => void,
  ) {
    if (!auth.user || !supabase || !security.contentKey) return;
    try {
      let recordCursor = "";
      while (true) {
        let query = supabase
          .from("encrypted_records")
          .select(
            "record_type,record_id,ciphertext,deleted,version,updated_by",
          )
          .eq("user_id", auth.user.id)
          .eq("record_type", recordType)
          .order("record_id", { ascending: true })
          .limit(syncPageSize);
        if (recordCursor) query = query.gt("record_id", recordCursor);
        const result = await query;
        if (result.error) throw result.error;

        const rows = result.data as EncryptedRecordRow[];
        for (const row of rows) await deliverRow(row, listener);
        if (rows.length < syncPageSize) return;

        const nextCursor = rows.at(-1)?.record_id;
        if (!nextCursor || nextCursor <= recordCursor) {
          throw new Error("Initial encrypted sync did not make progress.");
        }
        recordCursor = nextCursor;
      }
    } catch (nextError) {
      setReadError(syncReadErrorMessage(nextError));
    }
  }

  async function pullRecord(recordType: SyncRecordType, recordId: string) {
    if (!auth.user || !supabase || !security.contentKey) return;
    try {
      const result = await supabase
        .from("encrypted_records")
        .select(
          "record_type,record_id,ciphertext,deleted,version,updated_by",
        )
        .eq("user_id", auth.user.id)
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data) await receiveRow(result.data as EncryptedRecordRow);
    } catch (nextError) {
      setReadError(syncReadErrorMessage(nextError));
    }
  }

  async function reconcile() {
    if (
      reconciling.current ||
      !auth.user ||
      !supabase ||
      !security.contentKey
    ) {
      return;
    }

    reconciling.current = true;
    try {
      let cursor = overlapSyncCursor(reconciliationCursor.current);
      while (true) {
        const result = await supabase
          .from("encrypted_records")
          .select(
            "record_type,record_id,ciphertext,deleted,version,updated_by,updated_at",
          )
          .eq("user_id", auth.user.id)
          .gt("updated_at", cursor)
          .order("updated_at", { ascending: true })
          .order("record_type", { ascending: true })
          .order("record_id", { ascending: true })
          .limit(syncPageSize);
        if (result.error) throw result.error;

        const rows = result.data as EncryptedRecordRow[];
        if (rows.length === 0) break;
        const timestamp = rows.at(-1)?.updated_at;
        if (!timestamp || timestamp <= cursor) {
          throw new Error("Durable encrypted sync did not make progress.");
        }

        if (rows.length < syncPageSize) {
          for (const row of rows) {
            if (isSyncRecordType(row.record_type)) await receiveRow(row);
          }
          reconciliationCursor.current = timestamp;
          break;
        }

        for (const row of rows) {
          if (
            row.updated_at === timestamp ||
            !isSyncRecordType(row.record_type)
          ) {
            continue;
          }
          await receiveRow(row);
        }
        await pullTimestampGroup(timestamp);
        reconciliationCursor.current = timestamp;
        cursor = timestamp;
      }
      setReadError("");
      setLastSyncedAt(new Date().toISOString());
    } catch (nextError) {
      setReadError(syncReadErrorMessage(nextError));
    } finally {
      reconciling.current = false;
    }
  }

  async function pullTimestampGroup(timestamp: string) {
    if (!auth.user || !supabase) return;
    for (const recordType of syncRecordTypes) {
      let recordCursor = "";
      while (true) {
        let query = supabase
          .from("encrypted_records")
          .select(
            "record_type,record_id,ciphertext,deleted,version,updated_by,updated_at",
          )
          .eq("user_id", auth.user.id)
          .eq("updated_at", timestamp)
          .eq("record_type", recordType)
          .order("record_id", { ascending: true })
          .limit(syncPageSize);
        if (recordCursor) query = query.gt("record_id", recordCursor);
        const result = await query;
        if (result.error) throw result.error;

        const rows = result.data as EncryptedRecordRow[];
        for (const row of rows) await receiveRow(row);
        if (rows.length < syncPageSize) break;

        const nextCursor = rows.at(-1)?.record_id;
        if (!nextCursor || nextCursor <= recordCursor) {
          throw new Error("Timestamp reconciliation did not make progress.");
        }
        recordCursor = nextCursor;
      }
    }
  }

  async function receiveRow(row: EncryptedRecordRow) {
    const listeners = subscribers.current.get(row.record_type);
    if (!listeners) return;
    for (const listener of listeners) {
      await deliverRow(row, listener);
    }
  }

  async function deliverRow(
    row: EncryptedRecordRow,
    listener: (change: RemoteRecordChange) => void,
  ) {
    if (row.deleted || !row.ciphertext) {
      listener({
        operation: "delete",
        recordId: row.record_id,
        recordType: row.record_type,
      });
      return;
    }
    const value = isLegacyEnvelope(row.ciphertext)
      ? await security.decryptRecord(
          row.ciphertext,
          row.record_type,
          row.record_id,
        )
      : await decryptFields(row, security.decryptRecord);
    listener({
      operation: "upsert",
      recordId: row.record_id,
      recordType: row.record_type,
      value,
    });
  }

  return (
    <SyncContext.Provider
      value={{
        error: readError || outboxError,
        flush,
        lastSyncedAt,
        pending,
        queueDelete,
        queueUpsert,
        status: auth.localPreview
          ? "local"
          : readError
            ? "error"
            : outboxStatus,
        subscribe,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

function overlapSyncCursor(cursor: string) {
  const timestamp = new Date(cursor).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return initialSyncCursor;
  return new Date(timestamp - 1).toISOString();
}

function syncReadErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Encrypted changes could not be refreshed.";
}

interface EncryptedFieldValue {
  present: boolean;
  value?: unknown;
}

function isLegacyEnvelope(
  value: EncryptedEnvelope | EncryptedFieldPatch,
): value is EncryptedEnvelope {
  return "algorithm" in value && value.algorithm === "AES-256-GCM";
}

function isSyncRecordType(value: unknown): value is SyncRecordType {
  return (
    typeof value === "string" &&
    syncRecordTypes.has(value as SyncRecordType)
  );
}

async function decryptFields(
  row: EncryptedRecordRow,
  decrypt: <T>(
    envelope: EncryptedEnvelope,
    recordType: string,
    recordId: string,
  ) => Promise<T>,
) {
  const result: Record<string, unknown> = {};
  const fields = row.ciphertext as EncryptedFieldPatch;
  for (const [field, envelope] of Object.entries(fields)) {
    const decrypted = await decrypt<EncryptedFieldValue>(
      envelope,
      row.record_type,
      `${row.record_id}:${field}`,
    );
    if (decrypted.present) result[field] = decrypted.value;
  }
  return result;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used inside SyncProvider.");
  return context;
}
