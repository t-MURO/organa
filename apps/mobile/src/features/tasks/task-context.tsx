import {
  completeTaskOccurrence,
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
} from "react";

import { useAuth } from "../../auth/auth-context";
import { createNotificationScheduler } from "../../data/create-notification-scheduler";
import { createTaskRepository } from "../../data/create-task-repository";
import { useSync } from "../../sync/sync-context";
import { useDevices } from "../account/device-context";
import { useInteractionFeedback } from "../settings/interaction-feedback-context";

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
) {
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

  useEffect(() => {
    let active = true;

    async function load() {
      await repository.initialize();
      let tasks = await repository.list();

      if (tasks.length === 0) {
        tasks = seedTasks(formatLocalDate(new Date()));
        await Promise.all(tasks.map((task) => repository.upsert(task)));
        await Promise.all(
          tasks.map((task) => sync.queueUpsert("task", task.id, task)),
        );
      }

      if (active) {
        dispatch({ type: "loaded", tasks });
      }
      tasks.forEach((task) =>
        syncNotifications(task, false, devices.remindersAllowed),
      );
    }

    void load();
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    state.tasks.forEach((task) =>
      syncNotifications(task, false, devices.remindersAllowed),
    );
  }, [devices.remindersAllowed]);

  useEffect(
    () =>
      sync.subscribe<Task>("task", (change) => {
        if (change.operation === "delete") {
          dispatch({ type: "removed", id: change.recordId });
          void repository.remove(change.recordId);
          return;
        }
        if (!change.value) return;
        dispatch({ type: "upserted", task: change.value });
        void repository.upsert(change.value);
      }),
    [repository],
  );

  function addTask(input: CreateTaskInput) {
    const task = createTask(
      {
        ...input,
        plannedFor: input.plannedFor ?? formatLocalDate(new Date()),
      },
      makeId(),
    );
    dispatch({ type: "upserted", task });
    void repository.upsert(task);
    void sync.queueUpsert("task", task.id, task);
    syncNotifications(task, true, devices.remindersAllowed);
    feedback.created();
    return task;
  }

  function editTask(task: Task, input: CreateTaskInput) {
    const updated = updateTask(task, input);
    dispatch({ type: "upserted", task: updated });
    void repository.upsert(updated);
    void sync.queueUpsert("task", updated.id, updated, task);
    syncNotifications(updated, true, devices.remindersAllowed);
    return updated;
  }

  function removeTask(id: string) {
    dispatch({ type: "removed", id });
    void repository.remove(id);
    void sync.queueDelete("task", id);
    cancelNotifications(id);
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
      syncNotifications(reopened, false, devices.remindersAllowed);
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
    );
    feedback.completed();

    if (result.nextTask && !existingOccurrence) {
      dispatch({ type: "upserted", task: result.nextTask });
      void repository.upsert(result.nextTask);
      void sync.queueUpsert("task", result.nextTask.id, result.nextTask);
      syncNotifications(result.nextTask, false, devices.remindersAllowed);
    }
  }

  function toggleSubtask(task: Task, subtaskId: string) {
    const nextTask = toggleSubtaskCompletion(task, subtaskId);
    dispatch({ type: "upserted", task: nextTask });
    void repository.upsert(nextTask);
    void sync.queueUpsert("task", nextTask.id, nextTask, task);
  }

  return (
    <TaskContext.Provider
      value={{
        ...state,
        addTask,
        editTask,
        removeTask,
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
