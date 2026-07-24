import {
  completeTaskOccurrence,
  confirmMedicationDose,
  createTask,
  formatLocalDate,
  reopenTask,
  toggleSubtaskCompletion,
  updateTask,
  type CreateTaskInput,
  type Task,
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
import { createNotificationScheduler } from "../../data/create-notification-scheduler";
import { createTaskRepository } from "../../data/create-task-repository";
import { useSync } from "../../sync/sync-context";
import { useDevices } from "../account/device-context";
import { selectRestoreChanges } from "../account/restore-merge";
import { useInteractionFeedback } from "../settings/interaction-feedback-context";
import { reconcileRemoteTaskChange } from "./remote-task-reconciliation";

interface TaskState {
  loading: boolean;
  tasks: Task[];
}

type TaskAction =
  | { type: "loaded"; tasks: Task[] }
  | { type: "upserted"; task: Task }
  | { type: "removed"; id: string };

interface TaskContextValue extends TaskState {
  addTask(input: CreateTaskInput): Task;
  editTask(task: Task, input: CreateTaskInput): Task;
  removeTask(id: string): void;
  restoreTasks(tasks: Task[]): Promise<number>;
  confirmDose(task: Task): void;
  toggleTask(task: Task): void;
  toggleSubtask(task: Task, subtaskId: string): void;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);
const notificationScheduler = createNotificationScheduler();
let notificationInitialization: Promise<void> | undefined;

function initializeNotifications() {
  notificationInitialization ??= notificationScheduler
    .initialize()
    .catch(() => undefined);
  return notificationInitialization;
}

function syncNotifications(
  task: Task,
  requestPermission = false,
  enabled = true,
  authorizationReady = true,
) {
  if (!authorizationReady) return;
  if (!enabled) {
    cancelNotifications(task.id);
    return;
  }
  void initializeNotifications()
    .then(() => notificationScheduler.syncTask(task, requestPermission))
    .catch(() => undefined);
}

function cancelNotifications(taskId: string) {
  void initializeNotifications()
    .then(() => notificationScheduler.cancelTask(taskId))
    .catch(() => undefined);
}

function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "loaded":
      return { loading: false, tasks: action.tasks };
    case "upserted": {
      const exists = state.tasks.some((task) => task.id === action.task.id);
      return {
        ...state,
        tasks: exists
          ? state.tasks.map((task) =>
              task.id === action.task.id ? action.task : task,
            )
          : [...state.tasks, action.task],
      };
    }
    case "removed":
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.id),
      };
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function seedTasks(today: string): Task[] {
  const seedTime = new Date();

  return [
    createTask(
      {
        title: "Take morning medication",
        kind: "medication",
        priority: "must",
        plannedFor: today,
        scheduledTime: "08:00",
        estimatedMinutes: 2,
      },
      "seed-medication",
      seedTime,
    ),
    createTask(
      {
        title: "Reply to the important email",
        priority: "must",
        plannedFor: today,
        estimatedMinutes: 15,
      },
      "seed-email",
      seedTime,
    ),
    createTask(
      {
        title: "Water the plants",
        kind: "habit",
        priority: "should",
        plannedFor: today,
        scheduledTime: "17:30",
        estimatedMinutes: 10,
      },
      "seed-plants",
      seedTime,
    ),
    createTask(
      {
        title: "Clear one surface",
        priority: "nice",
        plannedFor: today,
        estimatedMinutes: 8,
      },
      "seed-surface",
      seedTime,
    ),
  ];
}

export function TaskProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const sync = useSync();
  const devices = useDevices();
  const feedback = useInteractionFeedback();
  const namespace = auth.user?.id ?? "local-preview";
  const repository = useMemo(
    () => createTaskRepository(namespace),
    [namespace],
  );
  const [state, dispatch] = useReducer(taskReducer, {
    loading: true,
    tasks: [],
  });
  const reminderAuthorizationRef = useRef({
    allowed: devices.remindersAllowed,
    ready: devices.reminderAuthorizationReady,
  });
  reminderAuthorizationRef.current = {
    allowed: devices.remindersAllowed,
    ready: devices.reminderAuthorizationReady,
  };

  useEffect(() => {
    let active = true;

    async function load() {
      await repository.initialize();
      let tasks = await repository.list();

      if (tasks.length === 0 && auth.localPreview) {
        tasks = seedTasks(formatLocalDate(new Date()));
        await Promise.all(tasks.map((task) => repository.upsert(task)));
        await Promise.all(
          tasks.map((task) => sync.queueUpsert("task", task.id, task)),
        );
      }

      if (active) {
        dispatch({ type: "loaded", tasks });
        const authorization = reminderAuthorizationRef.current;
        tasks.forEach((task) =>
          syncNotifications(
            task,
            false,
            authorization.allowed,
            authorization.ready,
          ),
        );
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [auth.localPreview, repository]);

  useEffect(() => {
    if (!devices.reminderAuthorizationReady) return;
    state.tasks.forEach((task) =>
      syncNotifications(task, false, devices.remindersAllowed),
    );
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
  ]);

  useEffect(
    () =>
      sync.subscribe<Task>("task", (change) => {
        void reconcileRemoteTaskChange(change, {
          cancelNotifications,
          remove: async (id) => {
            dispatch({ type: "removed", id });
            await repository.remove(id);
          },
          syncNotifications: (task) =>
            syncNotifications(
              task,
              false,
              devices.remindersAllowed,
              devices.reminderAuthorizationReady,
            ),
          upsert: async (task) => {
            dispatch({ type: "upserted", task });
            await repository.upsert(task);
          },
        });
      }),
    [
      devices.reminderAuthorizationReady,
      devices.remindersAllowed,
      repository,
    ],
  );

  function addTask(input: CreateTaskInput) {
    const task = createTask(input, makeId());
    dispatch({ type: "upserted", task });
    void repository.upsert(task);
    void sync.queueUpsert("task", task.id, task);
    syncNotifications(
      task,
      true,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
    );
    feedback.created();
    return task;
  }

  function editTask(task: Task, input: CreateTaskInput) {
    const updated = updateTask(task, input);
    dispatch({ type: "upserted", task: updated });
    void repository.upsert(updated);
    void sync.queueUpsert("task", updated.id, updated, task);
    syncNotifications(
      updated,
      true,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
    );
    return updated;
  }

  function removeTask(id: string) {
    dispatch({ type: "removed", id });
    void repository.remove(id);
    void sync.queueDelete("task", id);
    cancelNotifications(id);
  }

  async function restoreTasks(tasks: Task[]) {
    const current = await repository.list();
    const changes = selectRestoreChanges(current, tasks);
    await Promise.all(
      changes.map(async ({ previous, value }) => {
        await repository.upsert(value);
        await sync.queueUpsert("task", value.id, value, previous);
      }),
    );
    for (const { value } of changes) {
      dispatch({ type: "upserted", task: value });
      syncNotifications(
        value,
        false,
        devices.remindersAllowed,
        devices.reminderAuthorizationReady,
      );
    }
    return changes.length;
  }

  function confirmDose(task: Task) {
    const confirmed = confirmMedicationDose(task);
    if (confirmed === task) return;

    dispatch({ type: "upserted", task: confirmed });
    void repository.upsert(confirmed);
    void sync.queueUpsert("task", confirmed.id, confirmed, task);
  }

  function toggleTask(task: Task) {
    if (task.completedAt) {
      const reopened = reopenTask(task);
      const generatedOccurrence = state.tasks.find(
        (item) =>
          item.previousOccurrenceId === task.id && !item.completedAt,
      );

      dispatch({ type: "upserted", task: reopened });
      void repository.upsert(reopened);
      void sync.queueUpsert("task", reopened.id, reopened, task);
      syncNotifications(
        reopened,
        false,
        devices.remindersAllowed,
        devices.reminderAuthorizationReady,
      );
      if (generatedOccurrence) {
        dispatch({ type: "removed", id: generatedOccurrence.id });
        void repository.remove(generatedOccurrence.id);
        void sync.queueDelete("task", generatedOccurrence.id);
        cancelNotifications(generatedOccurrence.id);
      }
      return;
    }

    const existingOccurrence = state.tasks.find(
      (item) => item.previousOccurrenceId === task.id,
    );
    const result = completeTaskOccurrence(task, makeId());
    dispatch({ type: "upserted", task: result.completedTask });
    void repository.upsert(result.completedTask);
    void sync.queueUpsert(
      "task",
      result.completedTask.id,
      result.completedTask,
      task,
    );
    syncNotifications(
      result.completedTask,
      false,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
    );
    feedback.completed();

    if (result.nextTask && !existingOccurrence) {
      dispatch({ type: "upserted", task: result.nextTask });
      void repository.upsert(result.nextTask);
      void sync.queueUpsert("task", result.nextTask.id, result.nextTask);
      syncNotifications(
        result.nextTask,
        false,
        devices.remindersAllowed,
        devices.reminderAuthorizationReady,
      );
    }
  }

  function toggleSubtask(task: Task, subtaskId: string) {
    const nextTask = toggleSubtaskCompletion(task, subtaskId);
    if (nextTask === task) return;

    dispatch({ type: "upserted", task: nextTask });
    void repository.upsert(nextTask);
    void sync.queueUpsert("task", nextTask.id, nextTask, task);
    syncNotifications(
      nextTask,
      false,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
    );
  }

  return (
    <TaskContext.Provider
      value={{
        ...state,
        addTask,
        confirmDose,
        editTask,
        removeTask,
        restoreTasks,
        toggleTask,
        toggleSubtask,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TaskContext);

  if (!context) {
    throw new Error("useTasks must be used inside TaskProvider.");
  }

  return context;
}
