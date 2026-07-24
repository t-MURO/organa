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
} from "react";

import { useAuth } from "../../auth/auth-context";
import { createCheckInRepository } from "../../data/create-check-in-repository";
import { useSecurity } from "../../security/security-context";
import { useSync } from "../../sync/sync-context";
import { selectRestoreChanges } from "../account/restore-merge";

interface CheckInState {
  loading: boolean;
  entries: CheckInEntry[];
}

type CheckInAction =
  | { type: "loaded"; entries: CheckInEntry[] }
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
      const exists = state.entries.some(
        (entry) => entry.id === action.entry.id,
      );
      const entries = exists
        ? state.entries.map((entry) =>
            entry.id === action.entry.id ? action.entry : entry,
          )
        : [...state.entries, action.entry];

      return {
        ...state,
        entries: sortCheckInEntries(entries),
      };
    }
  }
}

export function CheckInProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const security = useSecurity();
  const sync = useSync();
  const namespace = auth.user?.id ?? "local-preview";
  const repository = useMemo(
    () => createCheckInRepository(namespace),
    [namespace],
  );
  const [state, dispatch] = useReducer(checkInReducer, {
    loading: true,
    entries: [],
  });

  useEffect(() => {
    let active = true;

    async function load() {
      await repository.initialize();
      const entries = await repository.list();

      if (active) {
        dispatch({ type: "loaded", entries });
      }
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
      sync.subscribe<CheckInEntry>("check_in", async (change) => {
        if (change.operation === "delete" || !change.value) return;
        await repository.upsert(change.value);
        dispatch({ type: "upserted", entry: change.value });
      }),
    [repository],
  );

  async function saveEntry(input: CheckInInput) {
    const existing = state.entries.find((entry) => entry.date === input.date);
    const entry = existing
      ? updateCheckInEntry(existing, input)
      : createCheckInEntry(
          input,
          await security.deriveRecordId("check_in", input.date),
        );

    const committed = await sync.commitUpsert(
      "check_in",
      entry.id,
      entry,
      existing,
    );
    if (!committed) {
      throw new Error("This Check-In could not be saved safely.");
    }
    dispatch({ type: "upserted", entry });
    return entry;
  }

  async function restoreEntries(entries: CheckInEntry[]) {
    const current = await repository.list();
    const normalized = await Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        id:
          current.find((candidate) => candidate.date === entry.date)?.id ??
          (await security.deriveRecordId("check_in", entry.date)),
      })),
    );
    const changes = selectRestoreChanges(current, normalized);
    const committed = await sync.commit(
      changes.map(({ previous, value }) => ({
        operation: "upsert",
        previousValue: previous,
        recordId: value.id,
        recordType: "check_in",
        value,
      })),
    );
    if (!committed) {
      throw new Error("The restored Check-In entries could not be saved.");
    }
    for (const { value } of changes) {
      dispatch({ type: "upserted", entry: value });
    }
    return changes.length;
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
