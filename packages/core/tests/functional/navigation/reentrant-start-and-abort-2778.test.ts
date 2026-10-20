import { describe, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { captureSyncThrow } from "../../helpers";

import type { Router, State } from "@real-router/core";

/**
 * #2778 — two doors past the reentrancy ban.
 *
 * `Router.#assertNotReentrant` refuses a navigation started while core
 * dispatches a router event, prepares a navigation or revalidates the route
 * table. Application code that ran inside one of those windows could still start
 * one through two doors:
 *
 * - `start()` took no check, so a listener could `stop()` and `start()` the
 *   router from inside the dispatch. The emitter drops an event emitted while the
 *   same event is dispatched, so the restart's `TRANSITION_SUCCESS` (in a success
 *   listener) or its `TRANSITION_START` (in a start listener) never reached
 *   anyone.
 * - An `abort` listener of a router-owned signal ran outside the counted
 *   dispatch: `handleCancel` aborts the cancelled navigation's controller before
 *   `emitTransitionCancel` raises the depth, and the synchronous failure arc
 *   aborts the failing navigation's controller before its `TRANSITION_ERROR`. A
 *   navigation started there ran to completion before the cancel it was nested
 *   in was announced.
 *
 * Each kind of refusal pairs with a control: a restart made outside a window
 * still succeeds, and so does a navigation an abort listener defers.
 */

const noop = (): void => {};

const codeOf = (error: unknown): string | undefined =>
  (error as { code?: string } | undefined)?.code;

/** The code of the SYNCHRONOUS throw the ban owes, or `"accepted"`. */
function attempt(call: () => unknown): string | undefined {
  const thrown = captureSyncThrow(call);

  return thrown === undefined ? "accepted" : codeOf(thrown);
}

/** A router-owned signal, refused loudly if a guard was handed none. */
function owned(signal: AbortSignal | undefined): AbortSignal {
  if (signal === undefined) {
    throw new Error("the guard was handed no signal");
  }

  return signal;
}

interface Hooks {
  onStart?: () => void;
  onStop?: () => void;
  onTransitionStart?: (toState: State) => void;
  onTransitionLeaveApprove?: (toState: State) => void;
  onTransitionSuccess?: (toState: State) => void;
  onTransitionError?: (toState: State | undefined) => void;
  onTransitionCancel?: (toState: State) => void;
  /** `canActivate` of `deny` — refuses unless told otherwise. */
  deny?: (signal: AbortSignal) => boolean;
  /** `canActivate` of `slow` — holds the navigation unless told otherwise. */
  slow?: (signal: AbortSignal) => Promise<boolean>;
}

interface Fixture {
  readonly router: Router;
  readonly hooks: Hooks;
  readonly log: string[];
}

function createFixture(): Fixture {
  const hooks: Hooks = {};
  const log: string[] = [];

  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "c", path: "/c" },
      {
        name: "deny",
        path: "/deny",
        canActivate: () => (_toState, _fromState, signal) =>
          hooks.deny?.(owned(signal)) ?? false,
      },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => (_toState, _fromState, signal) =>
          hooks.slow?.(owned(signal)) ??
          new Promise<boolean>(() => {
            /* held */
          }),
      },
    ],
    { defaultRoute: "home" },
  );

  router.usePlugin(() => ({
    onStart: () => {
      log.push("$start");
      hooks.onStart?.();
    },
    onStop: () => {
      log.push("$stop");
      hooks.onStop?.();
    },
    onTransitionStart: (toState) => {
      log.push(`START ${toState.name}`);
      hooks.onTransitionStart?.(toState);
    },
    onTransitionLeaveApprove: (toState) => {
      log.push(`LEAVE ${toState.name}`);
      hooks.onTransitionLeaveApprove?.(toState);
    },
    onTransitionSuccess: (toState) => {
      log.push(`SUCCESS ${toState.name}`);
      hooks.onTransitionSuccess?.(toState);
    },
    onTransitionError: (toState, _fromState, error) => {
      log.push(`ERROR ${toState?.name} ${error.code}`);
      hooks.onTransitionError?.(toState);
    },
    onTransitionCancel: (toState) => {
      log.push(`CANCEL ${toState.name}`);
      hooks.onTransitionCancel?.(toState);
    },
  }));

  return { router, hooks, log };
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Opens a window and runs `inside` from application code core calls in it. The
 * router is started on `/` unless the window is the start itself.
 */
type Window = (fx: Fixture, inside: () => void) => Promise<void>;

/** One cell per kind of window the restart is refused in, with the call that opens it. */
const WINDOWS: readonly (readonly [string, Window])[] = [
  [
    "a TRANSITION_START listener",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.onTransitionStart = (toState) => {
        if (toState.name === "a") {
          inside();
        }
      };
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a TRANSITION_LEAVE_APPROVE listener",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.onTransitionLeaveApprove = (toState) => {
        if (toState.name === "a") {
          inside();
        }
      };
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a TRANSITION_SUCCESS listener",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.onTransitionSuccess = (toState) => {
        if (toState.name === "a") {
          inside();
        }
      };
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a TRANSITION_ERROR listener",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.onTransitionError = (toState) => {
        if (toState?.name === "deny") {
          inside();
        }
      };
      await router.navigate("deny").catch(noop);
    },
  ],
  [
    "a TRANSITION_ERROR listener of a start() that failed before its boot began",
    async ({ router, hooks }, inside) => {
      hooks.onTransitionError = inside;
      // Not a string: refused after the start interceptors, before `$start`,
      // so the router is IDLE again while the error is dispatched.
      await router.start(42 as unknown as string).catch(noop);
    },
  ],
  [
    "a TRANSITION_CANCEL listener of the navigation a call supersedes",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.onTransitionCancel = (toState) => {
        if (toState.name === "slow") {
          inside();
        }
      };
      const held = router.navigate("slow").catch(noop);

      await router.navigate("a").catch(noop);
      await held;
    },
  ],
  [
    "a subscribe listener",
    async ({ router }, inside) => {
      await router.start("/");
      router.subscribe(({ route }) => {
        if (route.name === "a") {
          inside();
        }
      });
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a subscribeLeave listener",
    async ({ router }, inside) => {
      await router.start("/");
      router.subscribeLeave(({ nextRoute }) => {
        if (nextRoute.name === "a") {
          inside();
        }
      });
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a $start listener",
    async ({ router, hooks }, inside) => {
      hooks.onStart = inside;
      await router.start("/").catch(noop);
    },
  ],
  [
    "a $stop listener reached from inside a TRANSITION_SUCCESS listener",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.onStop = inside;
      hooks.onTransitionSuccess = (toState) => {
        if (toState.name === "a") {
          router.stop();
        }
      };
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a forwardState interceptor of a navigation being prepared",
    async ({ router }, inside) => {
      await router.start("/");
      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          if (name === "a") {
            inside();
          }

          return next(name, params, search);
        },
      );
      await router.navigate("a").catch(noop);
    },
  ],
  [
    "a subscribeChanges handler of replace()'s revalidation",
    async ({ router }, inside) => {
      await router.start("/");
      getRoutesApi(router).subscribeChanges(inside);
      // `inside` stops the router, so the revalidation may refuse to commit.
      captureSyncThrow(() => {
        getRoutesApi(router).replace([
          { name: "home", path: "/home" },
          { name: "b", path: "/b" },
        ]);
      });
      await settle();
    },
  ],
  [
    "an abort listener of the signal of a navigation a call supersedes",
    async ({ router, hooks }, inside) => {
      await router.start("/");
      hooks.slow = (signal) => {
        signal.addEventListener("abort", inside);

        return new Promise<boolean>(() => {
          /* held */
        });
      };
      const held = router.navigate("slow").catch(noop);

      await router.navigate("a").catch(noop);
      await held;
    },
  ],
];

describe("#2778 — start() is under the reentrancy ban", () => {
  it("has a cell per window — the table is not vacuously green", () => {
    expect(WINDOWS).toHaveLength(13);
  });

  it.each(WINDOWS)("refuses a restart from %s", async (_window, open) => {
    const fx = createFixture();
    let outcome: string | undefined;

    await open(fx, () => {
      outcome ??= (() => {
        fx.router.stop();

        return attempt(() => fx.router.start("/b"));
      })();
    });

    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);

    fx.router.dispose();
  });

  /**
   * The same restart, made where core runs nothing of its own: each one starts
   * the router on `/b`.
   */
  const CONTROLS: readonly (readonly [
    string,
    (fx: Fixture) => Promise<State>,
  ])[] = [
    [
      "top-level code",
      async ({ router }) => {
        await router.start("/");
        router.stop();

        return router.start("/b");
      },
    ],
    [
      "a $stop listener of a top-level stop()",
      async ({ router, hooks }) => {
        await router.start("/");
        let restarted: Promise<State> | undefined;

        hooks.onStop = () => {
          restarted ??= router.start("/b");
        };
        router.stop();

        return (
          restarted ??
          Promise.reject(new Error("no restart came out of the $stop listener"))
        );
      },
    ],
    [
      "a guard",
      async ({ router, hooks }) => {
        await router.start("/");
        let restarted: Promise<State> | undefined;

        hooks.deny = () => {
          router.stop();
          restarted = router.start("/b");

          return true;
        };
        await router.navigate("deny").catch(noop);

        return (
          restarted ??
          Promise.reject(new Error("no restart came out of the guard"))
        );
      },
    ],
    [
      "a microtask queued by a TRANSITION_SUCCESS listener",
      async ({ router, hooks }) => {
        await router.start("/");
        const restarted = new Promise<State>((resolve, reject) => {
          hooks.onTransitionSuccess = (toState) => {
            if (toState.name !== "a") {
              return;
            }

            queueMicrotask(() => {
              router.stop();
              router.start("/b").then(resolve, reject);
            });
          };
        });

        await router.navigate("a");

        return restarted;
      },
    ],
  ];

  it("has a cell per control", () => {
    expect(CONTROLS).toHaveLength(4);
  });

  it.each(CONTROLS)("starts the router from %s", async (_place, restart) => {
    const fx = createFixture();

    const state = await restart(fx);

    expect(state.name).toBe("b");
    expect(fx.router.getState()?.name).toBe("b");

    fx.router.dispose();
  });

  it("answers a start() that would start nothing with ALREADY_STARTED, inside a listener too", async () => {
    // The ban refuses a restart, not the call: on a router that is already
    // started, `start()` starts nothing, and it keeps the rejection it gives
    // outside the window rather than becoming a synchronous throw.
    const fx = createFixture();
    let outcome: Promise<State> | undefined;

    await fx.router.start("/");
    fx.hooks.onTransitionSuccess = (toState) => {
      if (toState.name === "a") {
        outcome = fx.router.start("/b");
      }
    };
    await fx.router.navigate("a");

    await expect(outcome).rejects.toMatchObject({
      code: errorCodes.ROUTER_ALREADY_STARTED,
    });

    fx.router.dispose();
  });

  it("leaves the router startable after it refuses a restart", async () => {
    // The refusal comes before the machine leaves IDLE: a ban checked after
    // `sendStart()` would leave it in STARTING, where every later `start()`
    // answers ALREADY_STARTED.
    const fx = createFixture();
    let outcome: string | undefined;

    await fx.router.start("/");
    fx.hooks.onTransitionSuccess = (toState) => {
      if (toState.name !== "a") {
        return;
      }

      fx.router.stop();
      outcome ??= attempt(() => fx.router.start("/b"));
    };
    await fx.router.navigate("a");

    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);
    await expect(fx.router.start("/b")).resolves.toMatchObject({ name: "b" });

    fx.router.dispose();
  });
});

/** How the navigation `slow` holds is cancelled, and how it was started. */
interface CancelSource {
  readonly hold: (router: Router) => Promise<unknown>;
  readonly cancel: (router: Router) => void;
}

const external = new WeakMap<Router, AbortController>();

const SOURCES: readonly (readonly [string, CancelSource])[] = [
  [
    "a superseding navigate()",
    {
      hold: (router) => router.navigate("slow"),
      cancel: (router) => {
        router.navigate("a").catch(noop);
      },
    },
  ],
  [
    "stop()",
    { hold: (router) => router.navigate("slow"), cancel: (r) => r.stop() },
  ],
  [
    "dispose()",
    {
      hold: (router) => router.navigate("slow"),
      cancel: (r) => {
        r.dispose();
      },
    },
  ],
  [
    "an aborted opts.signal",
    {
      hold: (router) => {
        const controller = new AbortController();

        external.set(router, controller);

        return router.navigate("slow", {}, {}, { signal: controller.signal });
      },
      cancel: (router) => external.get(router)?.abort(),
    },
  ],
  [
    "navigateToNotFound()",
    {
      hold: (router) => router.navigate("slow"),
      cancel: (router) => router.navigateToNotFound("/nowhere"),
    },
  ],
];

/** Every door that starts a navigation, called from the abort listener. */
const DOORS: readonly (readonly [string, (router: Router) => unknown])[] = [
  ["navigate()", (router) => router.navigate("c")],
  ["navigateToDefault()", (router) => router.navigateToDefault()],
  ["navigateToNotFound()", (router) => router.navigateToNotFound("/nf")],
  [
    "navigateToState()",
    (router) => {
      const api = getPluginApi(router);
      const state = api.matchPath("/c");

      if (state === undefined) {
        throw new Error("/c does not match");
      }

      return api.navigateToState(state);
    },
  ],
  [
    "start() after stop()",
    (router) => {
      router.stop();

      return router.start("/b");
    },
  ],
];

const CELLS = SOURCES.flatMap(([source, how]) =>
  DOORS.map(([door, call]) => [source, door, how, call] as const),
);

describe("#2778 — an abort listener of a cancelled navigation's signal is under the ban", () => {
  it("has a cell per cancel source and door", () => {
    expect(SOURCES).toHaveLength(5);
    expect(DOORS).toHaveLength(5);
    expect(CELLS).toHaveLength(25);
  });

  it.each(CELLS)(
    "cancelled by %s, refuses %s",
    async (_source, _door, how, call) => {
      const fx = createFixture();
      let outcome: string | undefined;

      await fx.router.start("/");
      fx.hooks.slow = (signal) => {
        signal.addEventListener("abort", () => {
          outcome ??= attempt(() => call(fx.router));
        });

        return new Promise<boolean>(() => {
          /* held */
        });
      };
      const held = how.hold(fx.router).catch(noop);

      // The door `start() after stop()` stops the router from inside the
      // cancel, so a source that commits afterwards may refuse synchronously.
      captureSyncThrow(() => {
        how.cancel(fx.router);
      });
      await held;

      expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);

      fx.router.dispose();
    },
  );

  it("names the abort listener in the refusal, with the remedy", async () => {
    // #1665: the code names a rule, so the message has to name the window a
    // caller is in — and an abort handler is not what reads as "a router event
    // listener".
    const fx = createFixture();
    let message: string | undefined;

    await fx.router.start("/");
    fx.hooks.slow = (signal) => {
      signal.addEventListener("abort", () => {
        message ??= (
          captureSyncThrow(() => fx.router.navigate("c")) as Error | undefined
        )?.message;
      });

      return new Promise<boolean>(() => {
        /* held */
      });
    };
    const held = fx.router.navigate("slow").catch(noop);

    await fx.router.navigate("a");
    await held;

    expect(message).toMatch(/abort listener/);
    expect(message).toMatch(/queueMicrotask/);

    fx.router.dispose();
  });

  it("refuses it from the signal a subscribeLeave listener was handed", async () => {
    const fx = createFixture();
    let outcome: string | undefined;

    await fx.router.start("/");
    fx.router.subscribeLeave(({ nextRoute, signal }) => {
      if (nextRoute.name !== "slow") {
        return;
      }

      signal.addEventListener("abort", () => {
        outcome ??= attempt(() => fx.router.navigate("c"));
      });

      return new Promise<void>(() => {
        /* held */
      });
    });
    const held = fx.router.navigate("slow").catch(noop);

    await fx.router.navigate("a");
    await held;

    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);

    fx.router.dispose();
  });

  it("announces the cancel before any navigation the listener starts", async () => {
    // What the stream looked like when the nested call ran: `START c`, `LEAVE c`,
    // `SUCCESS c` between `LEAVE slow` and `CANCEL slow`, so a listener that
    // reconstructs transitions from events saw `c` succeed while `slow` was
    // still in flight, and `slow` cancelled after `c` had finished.
    const fx = createFixture();
    let outcome: string | undefined;

    await fx.router.start("/");
    fx.log.length = 0;
    fx.hooks.slow = (signal) => {
      // A throw escaping an `abort` listener is an uncaught exception.
      signal.addEventListener("abort", () => {
        outcome ??= attempt(() => fx.router.navigate("c"));
      });

      return new Promise<boolean>(() => {
        /* held */
      });
    };
    const held = fx.router.navigate("slow").catch(noop);

    await fx.router.navigate("a");
    await held;

    // The listener ran: the stream below is also what a run without one logs.
    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(fx.log).toStrictEqual([
      "START slow",
      "LEAVE slow",
      "CANCEL slow",
      "START a",
      "LEAVE a",
      "SUCCESS a",
    ]);

    fx.router.dispose();
  });

  it("lets a listener defer the navigation past the cancel", async () => {
    const fx = createFixture();
    let deferred: Promise<State> | undefined;

    await fx.router.start("/");
    fx.hooks.slow = (signal) => {
      signal.addEventListener("abort", () => {
        queueMicrotask(() => {
          deferred = fx.router.navigate("c");
        });
      });

      return new Promise<boolean>(() => {
        /* held */
      });
    };
    const held = fx.router.navigate("slow").catch(noop);

    await fx.router.navigate("a");
    await held;

    await expect(deferred).resolves.toMatchObject({ name: "c" });

    fx.router.dispose();
  });
});

describe("#2778 — an abort the synchronous failure arc dispatches is under the ban", () => {
  it("refuses a navigation from the signal of a guard that refused", async () => {
    const fx = createFixture();
    let outcome: string | undefined;

    await fx.router.start("/");
    fx.hooks.deny = (signal) => {
      signal.addEventListener("abort", () => {
        outcome ??= attempt(() => fx.router.navigate("slow"));
      });

      return false;
    };
    await fx.router.navigate("deny").catch(noop);

    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);

    fx.router.dispose();
  });

  it("reports the refused navigation as failed, as its promise does", async () => {
    // With the nested call running, the stream said `CANCEL deny` while
    // `navigate("deny")` rejected `CANNOT_ACTIVATE`: the failure arc asked
    // whether the machine was still in A transition, and the nested one
    // answered for it.
    const fx = createFixture();
    let outcome: string | undefined;

    await fx.router.start("/");
    fx.log.length = 0;
    fx.hooks.deny = (signal) => {
      signal.addEventListener("abort", () => {
        outcome ??= attempt(() => fx.router.navigate("slow"));
      });

      return false;
    };

    await expect(fx.router.navigate("deny")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
    // The listener ran: the stream below is also what a run without one logs.
    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);
    expect(fx.log).toStrictEqual([
      "START deny",
      "LEAVE deny",
      `ERROR deny ${errorCodes.CANNOT_ACTIVATE}`,
    ]);

    fx.router.dispose();
  });

  it("aborts before it reports: a listener that stops the router ends the navigation cancelled", async () => {
    // The abort runs while the arc still settles the outcome, so a `stop()`
    // from its listener tears the navigation down before the refusal is
    // reported — a torn-down navigation reports nothing (#1609).
    const fx = createFixture();
    let stopped = false;

    await fx.router.start("/");
    fx.log.length = 0;
    fx.hooks.deny = (signal) => {
      signal.addEventListener("abort", () => {
        stopped = true;
        fx.router.stop();
      });

      return false;
    };

    await expect(fx.router.navigate("deny")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect(stopped).toBe(true);
    expect(fx.log).toStrictEqual([
      "START deny",
      "LEAVE deny",
      "CANCEL deny",
      "$stop",
    ]);

    fx.router.dispose();
  });

  it("refuses a navigation from the signal of a leave listener that threw", async () => {
    const fx = createFixture();
    let outcome: string | undefined;
    let armed = true;

    await fx.router.start("/");
    fx.router.subscribeLeave(({ signal }) => {
      if (!armed) {
        return;
      }

      armed = false;

      signal.addEventListener("abort", () => {
        outcome ??= attempt(() => fx.router.navigate("slow"));
      });

      throw new Error("leave listener failed");
    });
    await fx.router.navigate("a").catch(noop);

    expect(outcome).toBe(errorCodes.REENTRANT_NAVIGATION);

    fx.router.dispose();
  });

  it("lets the asynchronous arc's abort navigate: it runs after TRANSITION_ERROR", async () => {
    // The release in `finishAsyncNavigation`'s `finally` aborts a navigation
    // whose terminal event is already out, so a navigation started there is a
    // new one rather than one nested in the failure.
    const fx = createFixture();
    let nested: Promise<State> | undefined;

    await fx.router.start("/");
    fx.log.length = 0;
    fx.hooks.slow = (signal) => {
      signal.addEventListener("abort", () => {
        nested = fx.router.navigate("c");
      });

      return Promise.resolve(false);
    };
    await fx.router.navigate("slow").catch(noop);

    await expect(nested).resolves.toMatchObject({ name: "c" });
    expect(fx.log).toStrictEqual([
      "START slow",
      "LEAVE slow",
      `ERROR slow ${errorCodes.CANNOT_ACTIVATE}`,
      "START c",
      "LEAVE c",
      "SUCCESS c",
    ]);

    fx.router.dispose();
  });
});
