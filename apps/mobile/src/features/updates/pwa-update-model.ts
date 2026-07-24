export interface PwaUpdatePromptState {
  ready: boolean;
  restarting: boolean;
}

export type PwaUpdatePromptAction =
  | { type: "available" }
  | { type: "dismiss" }
  | { type: "restart" };

export const initialPwaUpdatePromptState: PwaUpdatePromptState = {
  ready: false,
  restarting: false,
};

export function reducePwaUpdatePrompt(
  state: PwaUpdatePromptState,
  action: PwaUpdatePromptAction,
): PwaUpdatePromptState {
  switch (action.type) {
    case "available":
      return state.restarting
        ? state
        : { ready: true, restarting: false };
    case "dismiss":
      return state.restarting
        ? state
        : { ready: false, restarting: false };
    case "restart":
      return { ready: true, restarting: true };
  }
}

interface WaitingWorker {
  postMessage(message: { type: "SKIP_WAITING" }): void;
}

interface UpdateRegistration {
  waiting: WaitingWorker | null;
}

export interface PwaServiceWorkerContainer {
  controller: unknown | null;
  getRegistration(): Promise<UpdateRegistration | undefined>;
  addEventListener(
    type: "controllerchange",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(
    type: "controllerchange",
    listener: () => void,
  ): void;
}

export interface PwaUpdateActivationOptions {
  cancelTimer(handle: unknown): void;
  reload(): void;
  scheduleTimer(callback: () => void, delayMs: number): unknown;
  timeoutMs?: number;
}

export type PwaUpdateActivationResult =
  | "requested-update"
  | "reloaded-current";

export function hasWaitingPwaUpdate(
  registration: UpdateRegistration | undefined,
  controller: unknown | null,
) {
  return Boolean(registration?.waiting && controller);
}

export async function activateWaitingPwaUpdate(
  serviceWorkers: PwaServiceWorkerContainer,
  options: PwaUpdateActivationOptions,
): Promise<PwaUpdateActivationResult> {
  let registration: UpdateRegistration | undefined;
  try {
    registration = await serviceWorkers.getRegistration();
  } catch {
    options.reload();
    return "reloaded-current";
  }

  const waitingWorker = registration?.waiting;
  if (!waitingWorker) {
    options.reload();
    return "reloaded-current";
  }

  let reloaded = false;
  let fallbackTimer: unknown;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    if (fallbackTimer !== undefined) {
      options.cancelTimer(fallbackTimer);
    }
    serviceWorkers.removeEventListener(
      "controllerchange",
      handleControllerChange,
    );
    options.reload();
  };
  const handleControllerChange = () => reloadOnce();

  serviceWorkers.addEventListener(
    "controllerchange",
    handleControllerChange,
    { once: true },
  );
  fallbackTimer = options.scheduleTimer(
    reloadOnce,
    options.timeoutMs ?? 5_000,
  );

  try {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  } catch {
    reloadOnce();
    return "reloaded-current";
  }

  return "requested-update";
}
