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
  useState,
} from "react";

import { useAuth } from "../../auth/auth-context";
import { createNotificationScheduler } from "../../data/create-notification-scheduler";
import { createTaskRepository } from "../../data/create-task-repository";
import type { NotificationSyncResult } from "../../data/notification-scheduler.types";
import { useSync } from "../../sync/sync-context";
import { useDevices } from "../account/device-context";
import { selectRestoreChanges } from "../account/restore-merge";
import { useInteractionFeedback } from "../settings/interaction-feedback-context";
import { reconcileRemoteTaskChange } from "./remote-task-reconciliation";
import { removeTaskFromList, upsertTaskInList } from "./task-state-model";

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
  clearReminderNotice(): void;
  editTask(task: Task, input: CreateTaskInput): Task;
  reminderNotice: string;
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
  notificationInitialization ??= notificationScheduler.initialize().catch(
    (error: unknown) => {
      notificationInitialization = undefined;
      throw error;
    },
  );
  return notificationInitialization;
}

function syncNotifications(
  task: Task,
  requestPermission = false,
  enabled = true,
  authorizationReady = true,
  report?: (message: string) => void,
) {
  if (!authorizationReady) return;
  if (!enabled) {
    cancelNotifications(task.id, report);
    return;
  }
  void initializeNotifications()
    .then(() => notificationScheduler.syncTask(task, requestPermission))
    .then((result) => {
      if (!hasEnabledReminder(task)) return;
      const notice = reminderNoticeFor(result);
      if (notice) report?.(notice);
    })
    .catch(() => {
      if (hasEnabledReminder(task)) {
        report?.(
          "Your task was saved, but this device could not schedule its reminder. Check system notification settings before relying on it.",
        );
      }
    });
}

function cancelNotifications(
  taskId: string,
  report?: (message: string) => void,
) {
  void initializeNotifications()
    .then(() => notificationScheduler.cancelTask(taskId))
    .catch(() =>
      report?.(
        "Organa could not update this device's scheduled reminders. Check system notification settings before relying on them.",
      ),
    );
}

function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "loaded":
      return { loading: false, tasks: action.tasks };
    case "upserted": {
      return {
        ...state,
        tasks: upsertTaskInList(state.tasks, action.task),
      };
    }
    case "removed":
      return {
        ...state,
        tasks: removeTaskFromList(state.tasks, action.id),
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
  const [reminderNotice, setReminderNotice] = useState("");
  const reminderAuthorizationRef = useRef({
    allowed: devices.remindersAllowed,
    ready: devices.reminderAuthorizationReady,
  });
  reminderAuthorizationRef.current = {
    allowed: devices.remindersAllowed,
    ready: devices.reminderAuthorizationReady,
  };

  useEffect(() => {
    setReminderNotice("");
  }, [namespace]);

  useEffect(() => {
    let active = true;

    async function load() {
      await repository.initialize();
      let tasks = await repository.list();

      if (tasks.length === 0 && auth.localPreview) {
        tasks = seedTasks(formatLocalDate(new Date()));
        const committed = await sync.commit(
          tasks.map((task) => ({
            operation: "upsert",
            recordId: task.id,
            recordType: "task",
            value: task,
          })),
        );
        if (!committed) {
          throw new Error("The preview tasks could not be saved.");
        }
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
            setReminderNotice,
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
      syncNotifications(
        task,
        false,
        devices.remindersAllowed,
        true,
        setReminderNotice,
      ),
    );
  }, [
    devices.reminderAuthorizationReady,
    devices.remindersAllowed,
  ]);

  useEffect(
    () =>
      sync.subscribe<Task>("task", (change) => {
        void reconcileRemoteTaskChange(change, {
          cancelNotifications: (id) =>
            cancelNotifications(id, setReminderNotice),
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
              setReminderNotice,
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
    void sync.commitUpsert("task", task.id, task);
    syncNotifications(
      task,
      true,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
      setReminderNotice,
    );
    feedback.created();
    return task;
  }

  function editTask(task: Task, input: CreateTaskInput) {
    const updated = updateTask(task, input);
    dispatch({ type: "upserted", task: updated });
    void sync.commitUpsert("task", updated.id, updated, task);
    syncNotifications(
      updated,
      true,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
      setReminderNotice,
    );
    return updated;
  }

  function removeTask(id: string) {
    dispatch({ type: "removed", id });
    void sync.commitDelete("task", id);
    cancelNotifications(id, setReminderNotice);
  }

  async function restoreTasks(tasks: Task[]) {
    const current = await repository.list();
    const changes = selectRestoreChanges(current, tasks);
    const committed = await sync.commit(
      changes.map(({ previous, value }) => ({
        operation: "upsert",
        previousValue: previous,
        recordId: value.id,
        recordType: "task",
        value,
      })),
    );
    if (!committed) throw new Error("The restored tasks could not be saved.");
    for (const { value } of changes) {
      dispatch({ type: "upserted", task: value });
      syncNotifications(
        value,
        false,
        devices.remindersAllowed,
        devices.reminderAuthorizationReady,
        setReminderNotice,
      );
    }
    return changes.length;
  }

  function confirmDose(task: Task) {
    const confirmed = confirmMedicationDose(task);
    if (confirmed === task) return;

    dispatch({ type: "upserted", task: confirmed });
    void sync.commitUpsert("task", confirmed.id, confirmed, task);
  }

  function toggleTask(task: Task) {
    if (task.completedAt) {
      const reopened = reopenTask(task);
      const generatedOccurrence = state.tasks.find(
        (item) =>
          item.previousOccurrenceId === task.id && !item.completedAt,
      );

      dispatch({ type: "upserted", task: reopened });
      syncNotifications(
        reopened,
        false,
        devices.remindersAllowed,
        devices.reminderAuthorizationReady,
        setReminderNotice,
      );
      if (generatedOccurrence) {
        dispatch({ type: "removed", id: generatedOccurrence.id });
        cancelNotifications(generatedOccurrence.id, setReminderNotice);
      }
      void sync.commit([
        {
          operation: "upsert",
          previousValue: task,
          recordId: reopened.id,
          recordType: "task",
          value: reopened,
        },
        ...(generatedOccurrence
          ? [
              {
                operation: "delete" as const,
                recordId: generatedOccurrence.id,
                recordType: "task" as const,
              },
            ]
          : []),
      ]);
      return;
    }

    const existingOccurrence = state.tasks.find(
      (item) => item.previousOccurrenceId === task.id,
    );
    const result = completeTaskOccurrence(task, makeId());
    dispatch({ type: "upserted", task: result.completedTask });
    syncNotifications(
      result.completedTask,
      false,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
      setReminderNotice,
    );
    feedback.completed();

    if (result.nextTask && !existingOccurrence) {
      dispatch({ type: "upserted", task: result.nextTask });
      syncNotifications(
        result.nextTask,
        false,
        devices.remindersAllowed,
        devices.reminderAuthorizationReady,
        setReminderNotice,
      );
    }
    void sync.commit([
      {
        operation: "upsert",
        previousValue: task,
        recordId: result.completedTask.id,
        recordType: "task",
        value: result.completedTask,
      },
      ...(result.nextTask && !existingOccurrence
        ? [
            {
              operation: "upsert" as const,
              recordId: result.nextTask.id,
              recordType: "task" as const,
              value: result.nextTask,
            },
          ]
        : []),
    ]);
  }

  function toggleSubtask(task: Task, subtaskId: string) {
    const nextTask = toggleSubtaskCompletion(task, subtaskId);
    if (nextTask === task) return;

    dispatch({ type: "upserted", task: nextTask });
    void sync.commitUpsert("task", nextTask.id, nextTask, task);
    syncNotifications(
      nextTask,
      false,
      devices.remindersAllowed,
      devices.reminderAuthorizationReady,
      setReminderNotice,
    );
  }

  return (
    <TaskContext.Provider
      value={{
        ...state,
        addTask,
        clearReminderNotice: () => setReminderNotice(""),
        confirmDose,
        editTask,
        reminderNotice,
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

function hasEnabledReminder(task: Task) {
  if (task.completedAt || !task.dueAt) return false;
  if (task.reminders.some((reminder) => reminder.enabled)) return true;
  return Boolean(
    task.subtaskRemindersEnabled &&
      task.subtasks.some((subtask) =>
        (subtask.reminders ?? task.reminders).some(
          (reminder) => reminder.enabled && !subtask.completedAt,
        ),
      ),
  );
}

function reminderNoticeFor(result: NotificationSyncResult) {
  if (result.permission === "not_requested") {
    return "This reminder is saved, but system notification permission has not been granted. Open the task and save it again when you are ready to allow reminders.";
  }
  if (result.permission === "denied") {
    return "Your task was saved, but system reminders are off. Enable notifications in device or browser settings before relying on this reminder.";
  }
  if (result.permission === "unsupported") {
    return "Your task was saved, but this app cannot deliver a system reminder here. Keep Organa open for in-app reminders or use a reminder-enabled device.";
  }
  if (result.scheduled === 0) {
    return "This task has reminders, but no upcoming system notification could be scheduled. Check its due time before relying on it.";
  }
  return "";
}

export function useTasks() {
  const context = useContext(TaskContext);

  if (!context) {
    throw new Error("useTasks must be used inside TaskProvider.");
  }

  return context;
}
