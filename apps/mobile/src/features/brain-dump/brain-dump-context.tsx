import {
  createBrainDumpBullet,
  rankAfterBullet,
  sortBrainDumpBullets,
  updateBrainDumpBullet,
  type BrainDumpBullet,
} from "@organa/domain";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useReducer,
} from "react";

import { createBrainDumpRepository } from "../../data/create-brain-dump-repository";

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
  updateBullet(bullet: BrainDumpBullet, text: string): void;
  removeBullet(id: string): void;
}

const BrainDumpContext = createContext<BrainDumpContextValue | undefined>(
  undefined,
);
const repository = createBrainDumpRepository();

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
  const [state, dispatch] = useReducer(brainDumpReducer, {
    loading: true,
    bullets: [],
  });

  useEffect(() => {
    let active = true;

    async function load() {
      await repository.initialize();
      const bullets = await repository.list();

      if (active) {
        dispatch({ type: "loaded", bullets });
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  function addBullet(text = "", afterId?: string) {
    const bullet = createBrainDumpBullet(
      text,
      makeId(),
      rankAfterBullet(state.bullets, afterId),
    );
    dispatch({ type: "upserted", bullet });
    void repository.upsert(bullet);
    return bullet.id;
  }

  function updateBullet(bullet: BrainDumpBullet, text: string) {
    if (bullet.text === text) return;

    const updated = updateBrainDumpBullet(bullet, text);
    dispatch({ type: "upserted", bullet: updated });
    void repository.upsert(updated);
  }

  function removeBullet(id: string) {
    dispatch({ type: "removed", id });
    void repository.remove(id);
  }

  return (
    <BrainDumpContext.Provider
      value={{ ...state, addBullet, updateBullet, removeBullet }}
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
