import {
  createTaskTemplate,
  updateTaskTemplate,
  type TaskTemplate,
  type TaskTemplateInput,
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
import { createTemplateRepository } from "../../data/create-template-repository";
import { useSync } from "../../sync/sync-context";
import { selectRestoreChanges } from "../account/restore-merge";

interface TemplateState {
  loading: boolean;
  userTemplates: TaskTemplate[];
}

type TemplateAction =
  | { type: "loaded"; templates: TaskTemplate[] }
  | { type: "upserted"; template: TaskTemplate }
  | { type: "removed"; id: string };

interface TemplateContextValue extends TemplateState {
  officialTemplates: TaskTemplate[];
  createTemplate(input: TaskTemplateInput): TaskTemplate;
  copyTemplate(template: TaskTemplate): TaskTemplate;
  editTemplate(
    template: TaskTemplate,
    input: TaskTemplateInput,
  ): TaskTemplate;
  removeTemplate(id: string): void;
  restoreTemplates(templates: TaskTemplate[]): Promise<number>;
}

const TemplateContext = createContext<TemplateContextValue | undefined>(
  undefined,
);
const officialDate = new Date("2026-01-01T00:00:00.000Z");

const officialTemplates = [
  createTaskTemplate(
    {
      name: "Morning medication",
      description: "A simple daily medication reminder.",
      task: {
        title: "Take morning medication",
        kind: "medication",
        priority: "must",
        scheduledTime: "08:00",
        estimatedMinutes: 2,
        recurrence: { frequency: "daily", interval: 1 },
        reminders: [
          {
            id: "at_due-0",
            stage: "at_due",
            offsetMinutes: 0,
            enabled: true,
          },
        ],
      },
    },
    "official-morning-medication",
    "official",
    officialDate,
  ),
  createTaskTemplate(
    {
      name: "Plant care",
      description: "A calm weekly check for indoor plants.",
      task: {
        title: "Check and water the plants",
        kind: "habit",
        priority: "should",
        estimatedMinutes: 10,
        recurrence: { frequency: "weekly", interval: 1 },
        graceDays: 3,
      },
    },
    "official-plant-care",
    "official",
    officialDate,
  ),
  createTaskTemplate(
    {
      name: "Two-minute reset",
      description: "Make one small area feel lighter.",
      task: {
        title: "Clear one small surface",
        priority: "nice",
        estimatedMinutes: 5,
      },
    },
    "official-small-reset",
    "official",
    officialDate,
  ),
  createTaskTemplate(
    {
      name: "Weekly reset",
      description: "A short review without turning it into a project.",
      task: {
        title: "Weekly reset",
        kind: "habit",
        priority: "should",
        estimatedMinutes: 20,
        recurrence: { frequency: "weekly", interval: 1 },
        subtasks: [
          { id: "official-step-1", title: "Review open tasks" },
          { id: "official-step-2", title: "Choose next priorities" },
        ],
      },
    },
    "official-weekly-reset",
    "official",
    officialDate,
  ),
];

function reducer(state: TemplateState, action: TemplateAction): TemplateState {
  switch (action.type) {
    case "loaded":
      return { loading: false, userTemplates: action.templates };
    case "upserted": {
      const exists = state.userTemplates.some(
        (template) => template.id === action.template.id,
      );
      return {
        ...state,
        userTemplates: exists
          ? state.userTemplates.map((template) =>
              template.id === action.template.id
                ? action.template
                : template,
            )
          : [...state.userTemplates, action.template],
      };
    }
    case "removed":
      return {
        ...state,
        userTemplates: state.userTemplates.filter(
          (template) => template.id !== action.id,
        ),
      };
  }
}

function makeId() {
  return `template-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function TemplateProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const sync = useSync();
  const namespace = auth.user?.id ?? "local-preview";
  const repository = useMemo(
    () => createTemplateRepository(namespace),
    [namespace],
  );
  const [state, dispatch] = useReducer(reducer, {
    loading: true,
    userTemplates: [],
  });

  useEffect(() => {
    let active = true;
    async function load() {
      await repository.initialize();
      const templates = await repository.list();
      if (active) dispatch({ type: "loaded", templates });
    }
    void load();
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(
    () =>
      sync.subscribe<TaskTemplate>("template", async (change) => {
        if (change.operation === "delete") {
          await repository.remove(change.recordId);
          dispatch({ type: "removed", id: change.recordId });
          return;
        }
        if (!change.value) return;
        await repository.upsert(change.value);
        dispatch({ type: "upserted", template: change.value });
      }),
    [repository],
  );

  function persist(template: TaskTemplate, previous?: TaskTemplate) {
    dispatch({ type: "upserted", template });
    void sync.commitUpsert(
      "template",
      template.id,
      template,
      previous,
    );
    return template;
  }

  function createTemplate(input: TaskTemplateInput) {
    return persist(createTaskTemplate(input, makeId(), "user"));
  }

  function copyTemplate(template: TaskTemplate) {
    return persist(
      createTaskTemplate(
        {
          name: `${template.name} copy`,
          description: template.description,
          task: template.task,
        },
        makeId(),
        "user",
      ),
    );
  }

  function editTemplate(template: TaskTemplate, input: TaskTemplateInput) {
    return persist(updateTaskTemplate(template, input), template);
  }

  function removeTemplate(id: string) {
    dispatch({ type: "removed", id });
    void sync.commitDelete("template", id);
  }

  async function restoreTemplates(templates: TaskTemplate[]) {
    const current = await repository.list();
    const changes = selectRestoreChanges(current, templates);
    const committed = await sync.commit(
      changes.map(({ previous, value }) => ({
        operation: "upsert",
        previousValue: previous,
        recordId: value.id,
        recordType: "template",
        value,
      })),
    );
    if (!committed) {
      throw new Error("The restored templates could not be saved.");
    }
    for (const { value } of changes) {
      dispatch({ type: "upserted", template: value });
    }
    return changes.length;
  }

  return (
    <TemplateContext.Provider
      value={{
        ...state,
        officialTemplates,
        createTemplate,
        copyTemplate,
        editTemplate,
        removeTemplate,
        restoreTemplates,
      }}
    >
      {children}
    </TemplateContext.Provider>
  );
}

export function useTemplates() {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error("useTemplates must be used inside TemplateProvider.");
  }
  return context;
}
