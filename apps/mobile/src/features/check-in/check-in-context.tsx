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
  useReducer,
} from "react";

import { createCheckInRepository } from "../../data/create-check-in-repository";

interface CheckInState {
  loading: boolean;
  entries: CheckInEntry[];
}

type CheckInAction =
  | { type: "loaded"; entries: CheckInEntry[] }
  | { type: "upserted"; entry: CheckInEntry };

interface CheckInContextValue extends CheckInState {
  saveEntry(input: CheckInInput): CheckInEntry;
}

const CheckInContext = createContext<CheckInContextValue | undefined>(
  undefined,
);
const repository = createCheckInRepository();

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

    void load();
    return () => {
      active = false;
    };
  }, []);

  function saveEntry(input: CheckInInput) {
    const existing = state.entries.find((entry) => entry.date === input.date);
    const entry = existing
      ? updateCheckInEntry(existing, input)
      : createCheckInEntry(input, `check-in-${input.date}`);

    dispatch({ type: "upserted", entry });
    void repository.upsert(entry);
    return entry;
  }

  return (
    <CheckInContext.Provider value={{ ...state, saveEntry }}>
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
