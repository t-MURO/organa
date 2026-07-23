import {
  completeTask,
  createTask,
  formatLocalDate,
  reopenTask,
  type Task,
  type TaskPriority,
} from "@organa/domain";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useReducer,
} from "react";

import { createTaskRepository } from "../../data/create-task-repository";

interface TaskState {
  loading: boolean;
  tasks: Task[];
}

type TaskAction =
  | { type: "loaded"; tasks: Task[] }
  | { type: "upserted"; task: Task };

interface TaskContextValue extends TaskState {
  addTask(title: string, priority: TaskPriority): void;
  toggleTask(task: Task): void;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);
const repository = createTaskRepository();

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
      }

      if (active) {
        dispatch({ type: "loaded", tasks });
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  function addTask(title: string, priority: TaskPriority) {
    const task = createTask(
      {
        title,
        priority,
        plannedFor: formatLocalDate(new Date()),
      },
      makeId(),
    );
    dispatch({ type: "upserted", task });
    void repository.upsert(task);
  }

  function toggleTask(task: Task) {
    const nextTask = task.completedAt ? reopenTask(task) : completeTask(task);
    dispatch({ type: "upserted", task: nextTask });
    void repository.upsert(nextTask);
  }

  return (
    <TaskContext.Provider value={{ ...state, addTask, toggleTask }}>
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
