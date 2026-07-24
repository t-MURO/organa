import { describe, expect, it } from "vitest";

import {
  activateWaitingPwaUpdate,
  hasWaitingPwaUpdate,
  initialPwaUpdatePromptState,
  reducePwaUpdatePrompt,
  type PwaServiceWorkerContainer,
} from "./pwa-update-model";

describe("PWA update model", () => {
  it("announces only a waiting update that can replace a controller", () => {
    const waiting = { postMessage() {} };

    expect(hasWaitingPwaUpdate({ waiting }, {})).toBe(true);
    expect(hasWaitingPwaUpdate({ waiting }, null)).toBe(false);
    expect(hasWaitingPwaUpdate({ waiting: null }, {})).toBe(false);
    expect(hasWaitingPwaUpdate(undefined, {})).toBe(false);
  });

  it("models availability, dismissal, and an in-progress restart", () => {
    const available = reducePwaUpdatePrompt(
      initialPwaUpdatePromptState,
      { type: "available" },
    );
    expect(available).toEqual({ ready: true, restarting: false });

    expect(
      reducePwaUpdatePrompt(available, { type: "dismiss" }),
    ).toEqual({ ready: false, restarting: false });

    const restarting = reducePwaUpdatePrompt(available, {
      type: "restart",
    });
    expect(restarting).toEqual({ ready: true, restarting: true });
    expect(
      reducePwaUpdatePrompt(restarting, { type: "available" }),
    ).toBe(restarting);
    expect(
      reducePwaUpdatePrompt(restarting, { type: "dismiss" }),
    ).toBe(restarting);
  });

  it("asks the waiting worker to activate and reloads once on handoff", async () => {
    const harness = createHarness();

    await expect(
      activateWaitingPwaUpdate(harness.container, harness.options),
    ).resolves.toBe("requested-update");
    expect(harness.messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(harness.listenerOptions).toEqual({ once: true });
    expect(harness.reloads()).toBe(0);
    expect(harness.scheduledDelay()).toBe(5_000);

    harness.fireControllerChange();
    harness.fireControllerChange();

    expect(harness.reloads()).toBe(1);
    expect(harness.cancelledTimers()).toEqual(["fallback"]);
  });

  it("reloads once when controller handoff never arrives", async () => {
    const harness = createHarness();

    await activateWaitingPwaUpdate(
      harness.container,
      harness.options,
    );
    harness.fireFallback();
    harness.fireControllerChange();

    expect(harness.reloads()).toBe(1);
    expect(harness.cancelledTimers()).toEqual(["fallback"]);
  });

  it("falls back safely when registration or worker messaging fails", async () => {
    const missing = createHarness({ waiting: false });
    await expect(
      activateWaitingPwaUpdate(missing.container, missing.options),
    ).resolves.toBe("reloaded-current");
    expect(missing.reloads()).toBe(1);

    const rejected = createHarness({ registrationRejects: true });
    await expect(
      activateWaitingPwaUpdate(rejected.container, rejected.options),
    ).resolves.toBe("reloaded-current");
    expect(rejected.reloads()).toBe(1);

    const messageFailure = createHarness({ messageThrows: true });
    await expect(
      activateWaitingPwaUpdate(
        messageFailure.container,
        messageFailure.options,
      ),
    ).resolves.toBe("reloaded-current");
    expect(messageFailure.reloads()).toBe(1);
    expect(messageFailure.cancelledTimers()).toEqual(["fallback"]);
  });
});

function createHarness({
  messageThrows = false,
  registrationRejects = false,
  waiting = true,
}: {
  messageThrows?: boolean;
  registrationRejects?: boolean;
  waiting?: boolean;
} = {}) {
  const messages: { type: "SKIP_WAITING" }[] = [];
  const cancelled: unknown[] = [];
  let controllerChange: (() => void) | undefined;
  let fallback: (() => void) | undefined;
  let delay: number | undefined;
  let reloadCount = 0;
  let listenerOptions: { once?: boolean } | undefined;

  const container: PwaServiceWorkerContainer = {
    controller: {},
    addEventListener(_type, listener, options) {
      controllerChange = listener;
      listenerOptions = options;
    },
    async getRegistration() {
      if (registrationRejects) throw new Error("registration failed");
      return {
        waiting: waiting
          ? {
              postMessage(message) {
                if (messageThrows) throw new Error("worker became stale");
                messages.push(message);
              },
            }
          : null,
      };
    },
    removeEventListener(_type, listener) {
      if (controllerChange === listener) controllerChange = undefined;
    },
  };

  return {
    cancelledTimers: () => cancelled,
    container,
    fireControllerChange: () => controllerChange?.(),
    fireFallback: () => fallback?.(),
    get listenerOptions() {
      return listenerOptions;
    },
    messages,
    options: {
      cancelTimer(handle: unknown) {
        cancelled.push(handle);
      },
      reload() {
        reloadCount += 1;
      },
      scheduleTimer(callback: () => void, delayMs: number) {
        fallback = callback;
        delay = delayMs;
        return "fallback";
      },
    },
    reloads: () => reloadCount,
    scheduledDelay: () => delay,
  };
}
