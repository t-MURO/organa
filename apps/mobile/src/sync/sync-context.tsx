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
import { createDurableRecordWriter } from "../data/create-durable-record-writer";
import { createSyncOutboxRepository } from "../data/create-sync-outbox-repository";
import type {
  DurableRecordWrite,
  LocalRecordChange,
  LocalRecordType,
} from "../data/durable-record-writer.types";
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

type RemoteRecordListener<T = unknown> = (
  change: RemoteRecordChange<T>,
) => void | Promise<void>;

interface RemoteRecordSubscription {
  deliveredVersions: Map<string, number>;
  listener: RemoteRecordListener;
}

interface RemoteDeliveryState {
  chain: Promise<void>;
  highestSeenVersion: number;
}

export type SyncCommitChange =
  | {
      local?: LocalRecordChange;
      operation: "upsert";
      previousValue?: unknown;
      recordId: string;
      recordType: SyncRecordType;
      value: unknown;
    }
  | {
      local?: LocalRecordChange;
      operation: "delete";
      recordId: string;
      recordType: SyncRecordType;
    };

interface SyncContextValue {
  error: string;
  lastSyncedAt?: string;
  localReadFailed: boolean;
  localSaveFailed: boolean;
  pending: number;
  reportLocalReadFailure(): void;
  status: "local" | "offline" | "syncing" | "synced" | "error";
  commit(changes: SyncCommitChange[]): Promise<boolean>;
  commitDelete(
    recordType: SyncRecordType,
    recordId: string,
    local?: LocalRecordChange,
  ): Promise<boolean>;
  commitUpsert(
    recordType: SyncRecordType,
    recordId: string,
    value: unknown,
    previousValue?: unknown,
    local?: LocalRecordChange,
  ): Promise<boolean>;
  compactBrainDumpUpdates(
    bulletId: string,
    snapshot: unknown,
    updateIds: string[],
  ): Promise<boolean>;
  flush(): Promise<void>;
  subscribe<T>(
    recordType: SyncRecordType,
    listener: RemoteRecordListener<T>,
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

interface PreparedRecordWrite {
  changedFields?: string[];
  local: LocalRecordChange;
  mutation?: EncryptedMutation;
  nextRecord?: Record<string, unknown>;
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
  const durableWriter = useMemo(
    () => createDurableRecordWriter(namespace),
    [namespace],
  );
  const subscribers = useRef(
    new Map<SyncRecordType, Set<RemoteRecordSubscription>>(),
  );
  const remoteDeliveries = useRef(new Map<string, RemoteDeliveryState>());
  const flushing = useRef(false);
  const reconciling = useRef(false);
  const reconciliationCursor = useRef(initialSyncCursor);
  const lastMutationTimestamp = useRef(0);
  const commitChain = useRef<Promise<unknown>>(Promise.resolve());
  const outboxInitialization = useRef<Promise<void> | null>(null);
  const outboxReady = useRef(false);
  const pendingMutationIdsByRecord = useRef(
    new Map<string, Set<string>>(),
  );
  const [pending, setPending] = useState(0);
  const [outboxStatus, setOutboxStatus] =
    useState<SyncContextValue["status"]>("local");
  const [outboxError, setOutboxError] = useState("");
  const [readError, setReadError] = useState("");
  const [localReadError, setLocalReadError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();

  useEffect(() => {
    let active = true;
    outboxReady.current = false;
    const initialization = Promise.all([
      repository.initialize(),
      durableWriter.initialize(),
    ]).then(() => undefined);
    outboxInitialization.current = initialization;
    void initialization
      .then(async () => {
        const mutations = await repository.list();
        if (!active) return;
        lastMutationTimestamp.current = Math.max(
          lastMutationTimestamp.current,
          ...mutations.map((mutation) => Date.parse(mutation.createdAt) || 0),
        );
        mutations.forEach((mutation) =>
          rememberPendingMutation(
            pendingMutationIdsByRecord.current,
            mutation.recordType,
            mutation.recordId,
            mutation.id,
          ),
        );
        outboxReady.current = true;
        setPending(mutations.length);
        for (const recordType of subscribers.current.keys()) {
          void pullRecordType(recordType);
        }
        if (auth.user) {
          void flush();
          void reconcile();
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOutboxStatus("error");
        setOutboxError(
          error instanceof Error
            ? error.message
            : "The local encrypted sync queue could not be opened.",
        );
      });

    const interval = setInterval(() => {
      if (auth.user) void flush();
    }, 5_000);
    return () => {
      active = false;
      if (outboxInitialization.current === initialization) {
        outboxInitialization.current = null;
      }
      clearInterval(interval);
    };
  }, [auth.user, durableWriter, repository]);

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

  function commitUpsert(
    recordType: SyncRecordType,
    recordId: string,
    value: unknown,
    previousValue?: unknown,
    local?: LocalRecordChange,
  ) {
    return commit([
      {
        local,
        operation: "upsert",
        recordId,
        recordType,
        previousValue,
        value,
      },
    ]);
  }

  function commitDelete(
    recordType: SyncRecordType,
    recordId: string,
    local?: LocalRecordChange,
  ) {
    return commit([{ local, operation: "delete", recordId, recordType }]);
  }

  function commit(changes: SyncCommitChange[]) {
    let prepared: PreparedRecordWrite[];
    try {
      prepared = prepareRecordWrites(changes);
    } catch {
      setStorageError(localSaveErrorMessage);
      return Promise.resolve(false);
    }

    const persist = () => persistRecordWrites(prepared);
    const result = commitChain.current.then(persist, persist);
    commitChain.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function compactBrainDumpUpdates(
    bulletId: string,
    snapshot: unknown,
    updateIds: string[],
  ) {
    try {
      const normalizedUpdateIds = [...new Set(updateIds)].sort();
      if (
        !auth.user ||
        !supabase ||
        !security.device ||
        normalizedUpdateIds.length < 1 ||
        normalizedUpdateIds.length > 4096
      ) {
        return false;
      }
      const timestamp = nextMutationTimestamp(lastMutationTimestamp);
      const snapshotRecord = asRecord(snapshot);
      const ciphertext: EncryptedFieldPatch = {};
      const fieldVersions: Record<string, string> = {};
      for (const [field, value] of Object.entries(snapshotRecord)) {
        ciphertext[field] = await security.encryptRecord(
          "brain_dump_bullet",
          `${bulletId}:${field}`,
          { present: true, value },
        );
        fieldVersions[field] = timestamp;
      }
      if (Object.keys(ciphertext).length === 0) return false;

      const result = await supabase.rpc("compact_brain_dump_updates", {
        p_bullet_id: bulletId,
        p_ciphertext: ciphertext,
        p_created_at: timestamp,
        p_device_id: security.device.id,
        p_device_proof: security.device.secret,
        p_field_versions: fieldVersions,
        p_mutation_id: randomUUID(),
        p_update_ids: normalizedUpdateIds,
      });
      if (result.error) return false;
      setLastSyncedAt(new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  function prepareRecordWrites(changes: SyncCommitChange[]) {
    const prepared: PreparedRecordWrite[] = [];
    try {
      for (const change of changes) {
        const local = change.local ?? defaultLocalChange(change);
        if (local.operation !== change.operation) {
          throw new Error("Local and encrypted operations do not match.");
        }
        if (!auth.user) {
          prepared.push({ local });
          continue;
        }

        if (change.operation === "upsert") {
          const nextRecord = asRecord(change.value);
          const changedFields = changedFieldNames(
            change.previousValue,
            change.value,
          );
          if (changedFields.length === 0) {
            prepared.push({ local });
            continue;
          }
          if (!security.device) {
            throw new Error("A trusted device is required to save changes.");
          }
          const timestamp = nextMutationTimestamp(lastMutationTimestamp);
          const mutationId = randomUUID();
          const mutation: EncryptedMutation = {
            attempts: 0,
            baseVersion: 0,
            ciphertext: {},
            createdAt: timestamp,
            deviceId: security.device.id,
            fieldVersions: Object.fromEntries(
              changedFields.map((field) => [field, timestamp]),
            ),
            id: mutationId,
            operation: "upsert",
            recordId: change.recordId,
            recordType: change.recordType,
            userId: auth.user.id,
          };
          rememberPendingMutation(
            pendingMutationIdsByRecord.current,
            mutation.recordType,
            mutation.recordId,
            mutation.id,
          );
          prepared.push({
            changedFields,
            local,
            mutation,
            nextRecord,
          });
          continue;
        }

        if (!security.device) {
          throw new Error("A trusted device is required to save changes.");
        }
        const timestamp = nextMutationTimestamp(lastMutationTimestamp);
        const mutationId = randomUUID();
        const mutation: EncryptedMutation = {
          attempts: 0,
          baseVersion: 0,
          createdAt: timestamp,
          deviceId: security.device.id,
          fieldVersions: { deleted: timestamp },
          id: mutationId,
          operation: "delete",
          recordId: change.recordId,
          recordType: change.recordType,
          userId: auth.user.id,
        };
        rememberPendingMutation(
          pendingMutationIdsByRecord.current,
          mutation.recordType,
          mutation.recordId,
          mutation.id,
        );
        prepared.push({
          local,
          mutation,
        });
      }
      return prepared;
    } catch (error) {
      prepared.forEach((item) => {
        if (!item.mutation) return;
        forgetPendingMutation(
          pendingMutationIdsByRecord.current,
          item.mutation.recordType,
          item.mutation.recordId,
          item.mutation.id,
        );
      });
      throw error;
    }
  }

  async function persistRecordWrites(prepared: PreparedRecordWrite[]) {
    let writes: DurableRecordWrite[];
    try {
      writes = [];
      for (const item of prepared) {
        let mutation = item.mutation;
        if (mutation?.operation === "upsert") {
          if (!item.nextRecord) {
            throw new Error("The encrypted upsert value is missing.");
          }
          const ciphertext: EncryptedFieldPatch = {};
          for (const field of item.changedFields ?? []) {
            ciphertext[field] = await security.encryptRecord(
              mutation.recordType,
              `${mutation.recordId}:${field}`,
              Object.prototype.hasOwnProperty.call(item.nextRecord, field)
                ? { present: true, value: item.nextRecord[field] }
                : { present: false },
            );
          }
          mutation = { ...mutation, ciphertext };
        }
        writes.push({ local: item.local, mutation });
      }

      await durableWriter.commit(writes);
    } catch {
      prepared.forEach((item) => {
        if (!item.mutation) return;
        forgetPendingMutation(
          pendingMutationIdsByRecord.current,
          item.mutation.recordType,
          item.mutation.recordId,
          item.mutation.id,
        );
      });
      setStorageError(localSaveErrorMessage);
      return false;
    }

    try {
      const mutations = await repository.list();
      setPending(mutations.length);
    } catch {
      setOutboxStatus("error");
      setOutboxError(
        "The saved encrypted sync queue could not be recounted.",
      );
    }
    void flush();
    return true;
  }

  async function flush() {
    if (
      flushing.current ||
      !outboxReady.current ||
      !auth.user ||
      !supabase ||
      !security.device
    ) {
      return;
    }
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
        forgetPendingMutation(
          pendingMutationIdsByRecord.current,
          mutation.recordType,
          mutation.recordId,
          mutation.id,
        );
        if (
          !hasPendingMutation(
            pendingMutationIdsByRecord.current,
            mutation.recordType,
            mutation.recordId,
          )
        ) {
          await pullRecord(mutation.recordType, mutation.recordId);
        }
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
      try {
        setPending((await repository.list()).length);
      } catch {
        setOutboxStatus("error");
        setOutboxError(
          "The local encrypted sync queue could not be read.",
        );
      }
    } finally {
      flushing.current = false;
    }
  }

  function subscribe<T>(
    recordType: SyncRecordType,
    listener: RemoteRecordListener<T>,
  ) {
    const listeners =
      subscribers.current.get(recordType) ??
      new Set<RemoteRecordSubscription>();
    const subscription: RemoteRecordSubscription = {
      deliveredVersions: new Map(),
      listener: listener as RemoteRecordListener,
    };
    listeners.add(subscription);
    subscribers.current.set(recordType, listeners);
    void pullRecordType(recordType);
    return () => {
      listeners.delete(subscription);
    };
  }

  async function pullRecordType(recordType: SyncRecordType) {
    if (
      !outboxReady.current ||
      !auth.user ||
      !supabase ||
      !security.contentKey
    ) {
      return;
    }
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
        for (const row of rows) await deliverRow(row);
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
    if (
      !outboxReady.current ||
      !auth.user ||
      !supabase ||
      !security.contentKey
    ) {
      return;
    }
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
      !outboxReady.current ||
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
    await deliverRow(row);
  }

  function deliverRow(row: EncryptedRecordRow) {
    if (!Number.isSafeInteger(row.version) || row.version < 1) {
      return Promise.reject(
        new Error("Encrypted sync returned an invalid record version."),
      );
    }
    const recordKey = pendingRecordKey(row.record_type, row.record_id);
    const state = remoteDeliveries.current.get(recordKey) ?? {
      chain: Promise.resolve(),
      highestSeenVersion: 0,
    };
    state.highestSeenVersion = Math.max(
      state.highestSeenVersion,
      row.version,
    );
    const delivery = state.chain.then(() =>
      deliverRowInOrder(row, recordKey, state),
    );
    state.chain = delivery.catch(() => undefined);
    remoteDeliveries.current.set(recordKey, state);
    return delivery;
  }

  async function deliverRowInOrder(
    row: EncryptedRecordRow,
    recordKey: string,
    state: RemoteDeliveryState,
  ) {
    await commitChain.current;
    if (row.version < state.highestSeenVersion) return;
    if (
      hasPendingMutation(
        pendingMutationIdsByRecord.current,
        row.record_type,
        row.record_id,
      )
    ) {
      return;
    }
    const subscriptions = subscribers.current.get(row.record_type);
    if (!subscriptions) return;
    const pendingSubscriptions = [...subscriptions].filter(
      (subscription) =>
        (subscription.deliveredVersions.get(recordKey) ?? 0) < row.version,
    );
    if (pendingSubscriptions.length === 0) return;

    const change: RemoteRecordChange =
      row.deleted || !row.ciphertext
        ? {
            operation: "delete",
            recordId: row.record_id,
            recordType: row.record_type,
          }
        : {
            operation: "upsert",
            recordId: row.record_id,
            recordType: row.record_type,
            value: isLegacyEnvelope(row.ciphertext)
              ? await security.decryptRecord(
                  row.ciphertext,
                  row.record_type,
                  row.record_id,
                )
              : await decryptFields(row, security.decryptRecord),
          };

    let deliveryError: unknown;
    for (const subscription of pendingSubscriptions) {
      if (!subscribers.current.get(row.record_type)?.has(subscription)) {
        continue;
      }
      try {
        await subscription.listener(change);
        subscription.deliveredVersions.set(recordKey, row.version);
      } catch (error) {
        deliveryError ??= error;
      }
    }
    if (deliveryError) throw deliveryError;
  }

  return (
    <SyncContext.Provider
      value={{
        commit,
        commitDelete,
        commitUpsert,
        compactBrainDumpUpdates,
        error: localReadError || readError || storageError || outboxError,
        flush,
        lastSyncedAt,
        localReadFailed: Boolean(localReadError),
        localSaveFailed: Boolean(storageError),
        pending,
        reportLocalReadFailure: () =>
          setLocalReadError(localReadErrorMessage),
        status: localReadError || storageError || readError
          ? "error"
          : auth.localPreview
            ? "local"
            : outboxStatus,
        subscribe,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

const localSaveErrorMessage =
  "A recent change could not be saved safely on this device.";
const localReadErrorMessage =
  "Saved data could not be opened safely on this device.";

function defaultLocalChange(change: SyncCommitChange): LocalRecordChange {
  if (change.recordType === "brain_dump_update") {
    throw new Error("Brain Dump updates require a local bullet change.");
  }
  const recordType = change.recordType as LocalRecordType;
  return change.operation === "upsert"
    ? {
        operation: "upsert",
        recordId: change.recordId,
        recordType,
        value: change.value,
      }
    : {
        operation: "delete",
        recordId: change.recordId,
        recordType,
      };
}

function overlapSyncCursor(cursor: string) {
  const timestamp = new Date(cursor).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return initialSyncCursor;
  return new Date(timestamp - 1).toISOString();
}

function nextMutationTimestamp(clock: { current: number }) {
  const timestamp = Math.max(Date.now(), clock.current + 1);
  clock.current = timestamp;
  return new Date(timestamp).toISOString();
}

function rememberPendingMutation(
  index: Map<string, Set<string>>,
  recordType: SyncRecordType,
  recordId: string,
  mutationId: string,
) {
  const key = pendingRecordKey(recordType, recordId);
  const ids = index.get(key) ?? new Set<string>();
  ids.add(mutationId);
  index.set(key, ids);
}

function forgetPendingMutation(
  index: Map<string, Set<string>>,
  recordType: SyncRecordType,
  recordId: string,
  mutationId: string,
) {
  const key = pendingRecordKey(recordType, recordId);
  const ids = index.get(key);
  if (!ids) return;
  ids.delete(mutationId);
  if (ids.size === 0) index.delete(key);
}

function hasPendingMutation(
  index: Map<string, Set<string>>,
  recordType: SyncRecordType,
  recordId: string,
) {
  return index.has(pendingRecordKey(recordType, recordId));
}

function pendingRecordKey(recordType: SyncRecordType, recordId: string) {
  return `${recordType}\u0000${recordId}`;
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
