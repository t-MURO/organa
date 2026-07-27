import {
  createCheckInEntry,
  sortCheckInEntries,
  updateCheckInEntry,
  type CheckInEntry,
  type CheckInInput,
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
import { createCheckInRepository } from "../../data/create-check-in-repository";
import { useSecurity } from "../../security/security-context";
import {
  type SyncCommitChange,
  useSync,
} from "../../sync/sync-context";

interface CheckInState {
  loading: boolean;
  entries: CheckInEntry[];
}

type CheckInAction =
  | { type: "loaded"; entries: CheckInEntry[] }
  | { type: "removed"; id: string }
  | { type: "upserted"; entry: CheckInEntry };

interface CheckInContextValue extends CheckInState {
  restoreEntries(entries: CheckInEntry[]): Promise<number>;
  saveEntry(input: CheckInInput): Promise<CheckInEntry>;
}

const CheckInContext = createContext<CheckInContextValue | undefined>(
  undefined,
);

function checkInReducer(
  state: CheckInState,
  action: CheckInAction,
): CheckInState {
  switch (action.type) {
    case "loaded":
      return {
        loading: false,
        entries: sortCheckInEntries(action.entries),
      };
    case "upserted": {
      return {
        ...state,
        entries: sortCheckInEntries([
          ...state.entries.filter(
            (entry) =>
              entry.id !== action.entry.id &&
              entry.date !== action.entry.date,
          ),
          action.entry,
        ]),
      };
    }
    case "removed":
      return {
        ...state,
        entries: state.entries.filter((entry) => entry.id !== action.id),
      };
  }
}

export function CheckInProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const security = useSecurity();
  const sync = useSync();
  const namespace = auth.ownerId ?? "signed-out";
  const repository = useMemo(
    () => createCheckInRepository(namespace),
    [namespace],
  );
  const [state, dispatch] = useReducer(checkInReducer, {
    loading: true,
    entries: [],
  });
  const hydration = useRef<Promise<void>>(Promise.resolve());
  const localVersions = useRef(new Map<string, number>());

  useEffect(() => {
    let active = true;
    localVersions.current.clear();

    async function load() {
      await repository.initialize();
      const storedEntries = await repository.list();
      const normalizedEntries = await Promise.all(
        storedEntries.map(normalizeEntryId),
      );
      const migrationChanges = storedEntries.flatMap((entry, index) =>
        entry.id === normalizedEntries[index]?.id
          ? []
          : replacementChanges(entry, normalizedEntries[index]!),
      );
      const migrated =
        migrationChanges.length === 0 ||
        (await sync.commit(migrationChanges));

      if (active) {
        dispatch({
          type: "loaded",
          entries: migrated ? normalizedEntries : storedEntries,
        });
        sync.reportLocalReadSuccess("check_in");
      }
    }

    const loading = load();
    hydration.current = loading.catch(() => undefined);
    void loading.catch(() => {
      if (active) sync.reportLocalReadFailure("check_in");
    });
    return () => {
      active = false;
    };
  }, [repository, sync.localRetryGeneration]);

  useEffect(
    () =>
      sync.subscribe<CheckInEntry>("check_in", async (change) => {
        const localVersion =
          localVersions.current.get(change.recordId) ?? 0;
        await hydration.current;
        if (
          (localVersions.current.get(change.recordId) ?? 0) !== localVersion
        ) {
          return;
        }
        if (change.operation === "delete") {
          await repository.remove(change.recordId);
          if (
            (localVersions.current.get(change.recordId) ?? 0) === localVersion
          ) {
            dispatch({ type: "removed", id: change.recordId });
          }
          return;
        }
        if (!change.value) return;
        if (change.value.id !== change.recordId) {
          throw new Error("The synchronized Check-In ID is invalid.");
        }
        await repository.upsert(change.value);
        if (
          (localVersions.current.get(change.recordId) ?? 0) === localVersion
        ) {
          dispatch({ type: "upserted", entry: change.value });
        }
      }),
    [repository],
  );

  async function saveEntry(input: CheckInInput) {
    const existing = state.entries.find((entry) => entry.date === input.date);
    const id = await security.deriveRecordId("check_in", input.date);
    const entry = existing
      ? { ...updateCheckInEntry(existing, input), id }
      : createCheckInEntry(input, id);

    rememberLocalChange(entry.id);
    if (existing && existing.id !== entry.id) {
      rememberLocalChange(existing.id);
    }
    const committed = await sync.commit(replacementChanges(existing, entry));
    if (!committed) {
      throw new Error("This Check-In could not be saved safely.");
    }
    dispatch({ type: "upserted", entry });
    return entry;
  }

  async function restoreEntries(entries: CheckInEntry[]) {
    const current = await repository.list();
    const currentByDate = new Map(
      current.map((entry) => [entry.date, entry]),
    );
    const incomingByDate = new Map<string, CheckInEntry>();
    for (const entry of entries) {
      const previous = incomingByDate.get(entry.date);
      if (!previous || entry.updatedAt > previous.updatedAt) {
        incomingByDate.set(entry.date, entry);
      }
    }

    const changes: SyncCommitChange[] = [];
    const mergedEntries: CheckInEntry[] = [];
    let restoredCount = 0;
    const dates = new Set([...currentByDate.keys(), ...incomingByDate.keys()]);
    for (const date of dates) {
      const previous = currentByDate.get(date);
      const incoming = incomingByDate.get(date);
      const incomingWins =
        Boolean(incoming) &&
        (!previous || incoming!.updatedAt > previous.updatedAt);
      const selected = incomingWins ? incoming! : previous;
      if (!selected) continue;

      const value = await normalizeEntryId(selected);
      if (!previous || previous.id !== value.id || incomingWins) {
        changes.push(...replacementChanges(previous, value));
        mergedEntries.push(value);
      }
      if (incomingWins) restoredCount += 1;
    }

    changes.forEach((change) => rememberLocalChange(change.recordId));
    const committed =
      changes.length === 0 || (await sync.commit(changes));
    if (!committed) {
      throw new Error("The restored Check-In entries could not be saved.");
    }
    for (const value of mergedEntries) {
      dispatch({ type: "upserted", entry: value });
    }
    return restoredCount;
  }

  async function normalizeEntryId(entry: CheckInEntry) {
    const id = await security.deriveRecordId("check_in", entry.date);
    return id === entry.id ? entry : { ...entry, id };
  }

  function rememberLocalChange(recordId: string) {
    localVersions.current.set(
      recordId,
      (localVersions.current.get(recordId) ?? 0) + 1,
    );
  }

  function replacementChanges(
    previous: CheckInEntry | undefined,
    value: CheckInEntry,
  ): SyncCommitChange[] {
    if (!previous || previous.id === value.id) {
      return [
        {
          operation: "upsert",
          previousValue: previous,
          recordId: value.id,
          recordType: "check_in",
          value,
        },
      ];
    }
    return [
      {
        operation: "delete",
        recordId: previous.id,
        recordType: "check_in",
      },
      {
        operation: "upsert",
        recordId: value.id,
        recordType: "check_in",
        value,
      },
    ];
  }

  return (
    <CheckInContext.Provider value={{ ...state, restoreEntries, saveEntry }}>
      {children}
    </CheckInContext.Provider>
  );
}

export function useCheckIns() {
  const context = useContext(CheckInContext);

  if (!context) {
    throw new Error("useCheckIns must be used inside CheckInProvider.");
  }

  return context;
}
