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

    void load();
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(
    () =>
      sync.subscribe<BrainDumpBullet>("brain_dump_bullet", (change) => {
        if (change.operation === "delete") {
          dispatch({ type: "removed", id: change.recordId });
          void repository.remove(change.recordId);
          pendingUpdates.current.delete(change.recordId);
          confirmedUpdateIds.current.delete(change.recordId);
          compactingBullets.current.delete(change.recordId);
          return;
        }
        if (!change.value) return;
        const local = stateRef.current.bullets.find(
          (bullet) => bullet.id === change.recordId,
        );
        let merged = mergeCrdtBullets(local, change.value);
        for (const update of pendingUpdates.current.get(change.recordId) ?? []) {
          merged = applyCrdtUpdate(merged, update);
          rememberConfirmedUpdate(update);
        }
        pendingUpdates.current.delete(change.recordId);
        dispatch({ type: "upserted", bullet: merged });
        void repository.upsert(merged);
        maybeCompact(merged);
      }),
    [repository],
  );

  useEffect(
    () =>
      sync.subscribe<BrainDumpCrdtUpdate>(
        "brain_dump_update",
        (change) => {
          if (change.operation === "delete") {
            forgetConfirmedUpdate(change.recordId);
            return;
          }
          if (!change.value) return;
          rememberConfirmedUpdate(change.value);
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
          dispatch({ type: "upserted", bullet: merged });
          void repository.upsert(merged);
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
    void repository.upsert(bullet);
    void sync.queueUpsert("brain_dump_bullet", bullet.id, bullet);
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
    void repository.upsert(result.bullet);
    void sync.queueUpsert(
      "brain_dump_update",
      result.update.id,
      result.update,
    );
  }

  function removeBullet(id: string) {
    dispatch({ type: "removed", id });
    void repository.remove(id);
    void sync.queueDelete("brain_dump_bullet", id);
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
    await Promise.all(
      restored.map(async ({ local, value }) => {
        await repository.upsert(value);
        await sync.queueUpsert(
          "brain_dump_bullet",
          value.id,
          value,
          local,
        );
      }),
    );
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
