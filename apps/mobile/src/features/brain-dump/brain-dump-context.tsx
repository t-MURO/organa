import {
  createBrainDumpBullet,
  rankAfterBullet,
  sortBrainDumpBullets,
  type BrainDumpBullet,
} from "@organa/domain";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { useAuth } from "../../auth/auth-context";
import { createBrainDumpRepository } from "../../data/create-brain-dump-repository";
import { useSync } from "../../sync/sync-context";
import {
  applyCrdtUpdate,
  brainDumpCompactionThreshold,
  createBrainDumpUpdateId,
  editCrdtBullet,
  initializeCrdtBullet,
  isCompactableBrainDumpUpdate,
  mergeCrdtBullets,
  type BrainDumpCrdtUpdate,
} from "./brain-dump-crdt";

interface BrainDumpState {
  loading: boolean;
  bullets: BrainDumpBullet[];
}

type BrainDumpAction =
  | { type: "loaded"; bullets: BrainDumpBullet[] }
  | { type: "upserted"; bullet: BrainDumpBullet }
  | { type: "removed"; id: string };

interface BrainDumpContextValue extends BrainDumpState {
  addBullet(text?: string, afterId?: string): string;
  restoreBullets(bullets: BrainDumpBullet[]): Promise<number>;
  updateBullet(bullet: BrainDumpBullet, text: string): void;
  removeBullet(id: string): void;
}

const BrainDumpContext = createContext<BrainDumpContextValue | undefined>(
  undefined,
);

function brainDumpReducer(
  state: BrainDumpState,
  action: BrainDumpAction,
): BrainDumpState {
  switch (action.type) {
    case "loaded":
      return {
        loading: false,
        bullets: sortBrainDumpBullets(action.bullets),
      };
    case "upserted": {
      const exists = state.bullets.some(
        (bullet) => bullet.id === action.bullet.id,
      );
      const bullets = exists
        ? state.bullets.map((bullet) =>
            bullet.id === action.bullet.id ? action.bullet : bullet,
          )
        : [...state.bullets, action.bullet];

      return {
        ...state,
        bullets: sortBrainDumpBullets(bullets),
      };
    }
    case "removed":
      return {
        ...state,
        bullets: state.bullets.filter((bullet) => bullet.id !== action.id),
      };
  }
}

function makeId() {
  return `thought-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export function BrainDumpProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const sync = useSync();
  const namespace = auth.user?.id ?? "local-preview";
  const repository = useMemo(
    () => createBrainDumpRepository(namespace),
    [namespace],
  );
  const [state, dispatch] = useReducer(brainDumpReducer, {
    loading: true,
    bullets: [],
  });
  const stateRef = useRef(state);
  const pendingUpdates = useRef(
    new Map<string, BrainDumpCrdtUpdate[]>(),
  );
  const confirmedUpdateIds = useRef(new Map<string, Set<string>>());
  const compactingBullets = useRef(new Set<string>());
  const deletedBulletIds = useRef(new Set<string>());
  const namespaceRef = useRef(namespace);
  const syncRef = useRef(sync);
  namespaceRef.current = namespace;
  syncRef.current = sync;
  stateRef.current = state;

  useEffect(() => {
    let active = true;
    pendingUpdates.current.clear();
    confirmedUpdateIds.current.clear();
    compactingBullets.current.clear();
    deletedBulletIds.current.clear();

    async function load() {
      await repository.initialize();
      const storedBullets = await repository.list();
      const bullets = storedBullets.map((bullet) =>
        bullet.crdtState ? bullet : initializeCrdtBullet(bullet),
      );

      if (active) {
        dispatch({ type: "loaded", bullets });
      }
      await Promise.all(bullets.map((bullet) => repository.upsert(bullet)));
    }

    void load().catch(() => {
      if (active) sync.reportLocalReadFailure();
    });
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(
    () =>
      sync.subscribe<BrainDumpBullet>("brain_dump_bullet", async (change) => {
        if (change.operation === "delete") {
          await repository.remove(change.recordId);
          dispatch({ type: "removed", id: change.recordId });
          deletedBulletIds.current.add(change.recordId);
          pendingUpdates.current.delete(change.recordId);
          confirmedUpdateIds.current.delete(change.recordId);
          compactingBullets.current.delete(change.recordId);
          return;
        }
        if (!change.value) return;
        if (deletedBulletIds.current.has(change.recordId)) return;
        const local = stateRef.current.bullets.find(
          (bullet) => bullet.id === change.recordId,
        );
        let merged = mergeCrdtBullets(local, change.value);
        const pending = pendingUpdates.current.get(change.recordId) ?? [];
        for (const update of pending) {
          merged = applyCrdtUpdate(merged, update);
        }
        await repository.upsert(merged);
        pending.forEach(rememberConfirmedUpdate);
        pendingUpdates.current.delete(change.recordId);
        dispatch({ type: "upserted", bullet: merged });
        maybeCompact(merged);
      }),
    [repository],
  );

  useEffect(
    () =>
      sync.subscribe<BrainDumpCrdtUpdate>(
        "brain_dump_update",
        async (change) => {
          if (change.operation === "delete") {
            forgetConfirmedUpdate(change.recordId);
            return;
          }
          if (!change.value) return;
          if (deletedBulletIds.current.has(change.value.bulletId)) return;
          const local = stateRef.current.bullets.find(
            (bullet) => bullet.id === change.value?.bulletId,
          );
          if (!local) {
            const queued =
              pendingUpdates.current.get(change.value.bulletId) ?? [];
            if (!queued.some((item) => item.id === change.value?.id)) {
              queued.push(change.value);
            }
            pendingUpdates.current.set(change.value.bulletId, queued);
            return;
          }
          const merged = applyCrdtUpdate(local, change.value);
          await repository.upsert(merged);
          rememberConfirmedUpdate(change.value);
          dispatch({ type: "upserted", bullet: merged });
          maybeCompact(merged);
        },
      ),
    [repository],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      stateRef.current.bullets.forEach(maybeCompact);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  function addBullet(text = "", afterId?: string) {
    const bullet = initializeCrdtBullet(
      createBrainDumpBullet(
        text,
        makeId(),
        rankAfterBullet(state.bullets, afterId),
      ),
    );
    dispatch({ type: "upserted", bullet });
    void sync.commitUpsert("brain_dump_bullet", bullet.id, bullet);
    return bullet.id;
  }

  function updateBullet(bullet: BrainDumpBullet, text: string) {
    if (bullet.text === text) return;

    const result = editCrdtBullet(
      bullet,
      text,
      createBrainDumpUpdateId(
        bullet.id,
        `${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,
      ),
    );
    dispatch({ type: "upserted", bullet: result.bullet });
    void sync.commitUpsert(
      "brain_dump_update",
      result.update.id,
      result.update,
      undefined,
      {
        operation: "upsert",
        recordId: result.bullet.id,
        recordType: "brain_dump_bullet",
        value: result.bullet,
      },
    );
  }

  function removeBullet(id: string) {
    deletedBulletIds.current.add(id);
    dispatch({ type: "removed", id });
    void sync.commitDelete("brain_dump_bullet", id);
    pendingUpdates.current.delete(id);
    confirmedUpdateIds.current.delete(id);
    compactingBullets.current.delete(id);
  }

  function rememberConfirmedUpdate(update: BrainDumpCrdtUpdate) {
    if (!isCompactableBrainDumpUpdate(update)) return;
    const ids =
      confirmedUpdateIds.current.get(update.bulletId) ?? new Set<string>();
    ids.add(update.id);
    confirmedUpdateIds.current.set(update.bulletId, ids);
  }

  function forgetConfirmedUpdate(updateId: string) {
    for (const [bulletId, ids] of confirmedUpdateIds.current) {
      ids.delete(updateId);
      if (ids.size === 0) confirmedUpdateIds.current.delete(bulletId);
    }
  }

  function maybeCompact(bullet: BrainDumpBullet) {
    const compactionNamespace = namespaceRef.current;
    const ids = confirmedUpdateIds.current.get(bullet.id);
    if (
      !ids ||
      ids.size < brainDumpCompactionThreshold ||
      compactingBullets.current.has(bullet.id)
    ) {
      return;
    }

    const includedIds = [...ids].sort();
    compactingBullets.current.add(bullet.id);
    void syncRef.current
      .compactBrainDumpUpdates(bullet.id, bullet, includedIds)
      .then((compacted) => {
        if (!compacted || namespaceRef.current !== compactionNamespace) return;
        const current = confirmedUpdateIds.current.get(bullet.id);
        if (!current) return;
        includedIds.forEach((id) => current.delete(id));
        if (current.size === 0) confirmedUpdateIds.current.delete(bullet.id);
      })
      .finally(() => {
        if (namespaceRef.current !== compactionNamespace) return;
        compactingBullets.current.delete(bullet.id);
      });
  }

  async function restoreBullets(bullets: BrainDumpBullet[]) {
    const current = await repository.list();
    const incomingById = new Map<string, BrainDumpBullet>();
    for (const bullet of bullets) {
      incomingById.set(
        bullet.id,
        mergeCrdtBullets(incomingById.get(bullet.id), bullet),
      );
    }

    const restored = [...incomingById.values()].map((incoming) => {
      const local = current.find(
        (bullet) => bullet.id === incoming.id,
      );
      return { local, value: mergeCrdtBullets(local, incoming) };
    });
    const committed = await sync.commit(
      restored.map(({ local, value }) => ({
        operation: "upsert",
        previousValue: local,
        recordId: value.id,
        recordType: "brain_dump_bullet",
        value,
      })),
    );
    if (!committed) {
      throw new Error("The restored Brain Dump could not be saved.");
    }
    for (const { value } of restored) {
      dispatch({ type: "upserted", bullet: value });
    }
    return restored.length;
  }

  return (
    <BrainDumpContext.Provider
      value={{
        ...state,
        addBullet,
        restoreBullets,
        updateBullet,
        removeBullet,
      }}
    >
      {children}
    </BrainDumpContext.Provider>
  );
}

export function useBrainDump() {
  const context = useContext(BrainDumpContext);

  if (!context) {
    throw new Error("useBrainDump must be used inside BrainDumpProvider.");
  }

  return context;
}
