import { describe, it, expect } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { captureSyncThrow } from "../../helpers";

import type { Route, Router } from "@real-router/core";

/**
 * #2787 — a cancellation raised by application code while the machine still
 * carries the navigation leaves the band through the machine's own `CANCEL`
 * edge: one `TRANSITION_CANCEL`, no `TRANSITION_ERROR`, the band settled.
 *
 * The sources are a guard's quiet cancel — a thrown or rejected
 * `RouterError(TRANSITION_CANCELLED)` (#933) or `AbortError` — and a
 * `subscribeLeave` listener throwing or rejecting with that `RouterError`. A
 * leave listener's `ROUTE_NOT_FOUND`, and an error of its own that merely
 * carries one of the two codes, are failures like any other listener error.
 *
 * The CONTROLS hold the other half: a navigation the machine has already moved
 * past — superseded by a redirect or by a newer navigation, or reported by
 * `completeTransition` itself — is not moved a second time, and whatever the
 * machine carries by then keeps running.
 */

type Shape = "RouterError" | "AbortError";
type Timing = "sync" | "async";

const codeOf = (error: unknown): unknown =>
  (error as { code?: unknown } | undefined)?.code;

const cancelled = (error: unknown): boolean =>
  codeOf(error) === errorCodes.TRANSITION_CANCELLED;

const quietCancel = (shape: Shape): unknown =>
  shape === "RouterError"
    ? new RouterError(errorCodes.TRANSITION_CANCELLED)
    : new DOMException("aborted", "AbortError");

/** A guard raising `error()` on its FIRST call — thrown or rejected — and allowing every later one. */
function guardFailingOnce(
  error: () => unknown,
  timing: Timing,
): () => boolean | Promise<boolean> {
  let fired = false;

  return () => {
    if (fired) {
      return true;
    }

    fired = true;

    if (timing === "sync") {
      throw error();
    }

    return Promise.reject(error());
  };
}

/** A `subscribeLeave` listener raising `error()` on its FIRST call — thrown or rejected. */
function leaveFailingOnce(
  error: () => unknown,
  timing: Timing,
): () => Promise<void> | undefined {
  let fired = false;

  return () => {
    if (fired) {
      return;
    }

    fired = true;

    if (timing === "sync") {
      throw error();
    }

    return Promise.reject(error());
  };
}

/** A guard that holds its navigation until `release()`. */
function heldGuard(): {
  guard: () => Promise<boolean>;
  release: (value: boolean) => void;
} {
  let release!: (value: boolean) => void;

  return {
    guard: () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    release: (value) => {
      release(value);
    },
  };
}

interface Fixture {
  router: Router;
  log: string[];
  warnings: () => number;
}

function createFixture(routes: Route[], defaultRoute = "home"): Fixture {
  const log: string[] = [];
  let warnings = 0;

  const router = createRouter(
    [{ name: "home", path: "/" }, { name: "b", path: "/b" }, ...routes],
    {
      defaultRoute,
      logger: {
        callbackIgnoresLevel: true,
        callback: (_level, _context, message) => {
          if (message.includes("Concurrent navigation")) {
            warnings++;
          }
        },
      },
    },
  );

  router.usePlugin(() => ({
    onStart: () => log.push("$start"),
    onStop: () => log.push("$stop"),
    onTransitionStart: (to) => log.push(`START:${to.name}`),
    onTransitionCancel: (to) => log.push(`CANCEL:${to.name}`),
    onTransitionError: (to, _from, error) =>
      log.push(`ERROR:${to?.name}:${String(codeOf(error))}`),
    onTransitionSuccess: (to) => log.push(`SUCCESS:${to.name}`),
  }));

  return { router, log, warnings: () => warnings };
}

/** On `t`'s activation, or on the deactivation of the `home` it leaves. */
function installGuard(
  router: Router,
  phase: "activate" | "deactivate",
  guard: () => boolean | Promise<boolean>,
): void {
  const lifecycle = getLifecycleApi(router);

  if (phase === "activate") {
    lifecycle.addActivateGuard("t", () => guard);
  } else {
    lifecycle.addDeactivateGuard("home", () => guard);
  }
}

/** The band is left — `LEAVE_APPROVED` is part of it, so this covers `isLeaveApproved()` too. */
function expectSettled(router: Router): void {
  expect(getInternals(router).isTransitioning()).toBe(false);
}

/** The next navigation finds nothing to supersede. */
async function expectCleanNext({ router, log, warnings }: Fixture) {
  log.length = 0;

  await router.navigate("b");

  expect(log).toStrictEqual(["START:b", "SUCCESS:b"]);
  expect(warnings()).toBe(0);
}

/** A start interceptor that holds every start after `park()` until `release()`. */
function parkStarts(router: Router): {
  park: () => void;
  release: () => void;
} {
  let parking = false;
  let release!: () => void;
  const parked = new Promise<void>((resolve) => {
    release = resolve;
  });

  getPluginApi(router).addInterceptor("start", async (next, path) => {
    if (parking) {
      await parked;
    }

    return next(path);
  });

  return {
    park: () => {
      parking = true;
    },
    release: () => {
      release();
    },
  };
}

/**
 * A caller's signal whose `removeEventListener` stops and restarts the router —
 * application code the `FAIL` action reaches as it closes the bridge, outside
 * any counted dispatch.
 */
function signalThatRestarts(
  router: Router,
  path: string,
): { signal: AbortSignal; restart: () => Promise<unknown> | undefined } {
  const signal = new AbortController().signal;
  const remove = signal.removeEventListener.bind(signal);
  let restart: Promise<unknown> | undefined;

  Object.defineProperty(signal, "removeEventListener", {
    value: (...args: Parameters<AbortSignal["removeEventListener"]>) => {
      remove(...args);
      restart ??= restartRouter(router, path);
    },
  });

  return { signal, restart: () => restart };
}

function restartRouter(router: Router, path: string): Promise<unknown> {
  router.stop();

  return router.start(path).then((state) => state.name, codeOf);
}

/** The same kind of signal, whose `removeEventListener` starts a navigation instead. */
function signalThatNavigates(
  router: Router,
  name: string,
): { signal: AbortSignal; started: () => Promise<unknown> | undefined } {
  const signal = new AbortController().signal;
  const remove = signal.removeEventListener.bind(signal);
  let started: Promise<unknown> | undefined;

  Object.defineProperty(signal, "removeEventListener", {
    value: (...args: Parameters<AbortSignal["removeEventListener"]>) => {
      remove(...args);
      started ??= router.navigate(name).then((state) => state.name, codeOf);
    },
  });

  return { signal, started: () => started };
}

const TIMINGS = ["sync", "async"] as const;

const GUARD_CELLS = (["activate", "deactivate"] as const).flatMap((phase) =>
  (["RouterError", "AbortError"] as const).flatMap((shape) =>
    TIMINGS.map((timing) => ({ phase, shape, timing })),
  ),
);

const LEAVE_CELLS = (["guard-free", "guarded"] as const).flatMap((arc) =>
  TIMINGS.map((timing) => ({ arc, timing })),
);

const DOORS = ["navigateToState", "navigateToDefault"] as const;

const COLLIDING_CODES = [
  errorCodes.TRANSITION_CANCELLED,
  errorCodes.ROUTE_NOT_FOUND,
] as const;

/** `t`, reached through a guard-free arc or through one an allowing guard walks. */
const routeT = (arc: "guard-free" | "guarded"): Route => ({
  name: "t",
  path: "/t",
  ...(arc === "guarded" && { canActivate: () => () => true }),
});

describe("#2787 — a quiet cancel leaves the band through CANCEL", () => {
  it("every cell table registers its full product, each cell once", () => {
    expect(TIMINGS).toHaveLength(2);
    expect(TIMINGS).toStrictEqual(["sync", "async"]);
    expect(DOORS).toHaveLength(2);
    expect(DOORS).toStrictEqual(["navigateToState", "navigateToDefault"]);
    expect(COLLIDING_CODES).toHaveLength(2);
    expect(COLLIDING_CODES).toStrictEqual(["CANCELLED", "ROUTE_NOT_FOUND"]);
    expect(GUARD_CELLS).toHaveLength(8);
    expect(
      new Set(GUARD_CELLS.map((c) => `${c.phase}/${c.shape}/${c.timing}`)).size,
    ).toBe(8);
    expect(LEAVE_CELLS).toHaveLength(4);
    expect(new Set(LEAVE_CELLS.map((c) => `${c.arc}/${c.timing}`)).size).toBe(
      4,
    );
  });

  it.each(GUARD_CELLS)(
    "$phase guard, $shape, $timing: one TRANSITION_CANCEL, band settled",
    async ({ phase, shape, timing }) => {
      const fixture = createFixture([{ name: "t", path: "/t" }]);
      const { router, log } = fixture;

      installGuard(
        router,
        phase,
        guardFailingOnce(() => quietCancel(shape), timing),
      );

      await router.start("/");
      log.length = 0;

      const navigation = router.navigate("t");

      // A synchronous verdict is settled inside the call; an asynchronous one
      // is still parked — which is what makes `timing` an axis at all.
      expect(getInternals(router).isTransitioning()).toBe(timing === "async");

      await expect(navigation).rejects.toSatisfy(cancelled);

      expect(log).toStrictEqual(["START:t", "CANCEL:t"]);

      expectSettled(router);

      await expectCleanNext(fixture);
    },
  );

  it.each(LEAVE_CELLS)(
    "subscribeLeave raising RouterError(TRANSITION_CANCELLED), $arc arc, $timing: one TRANSITION_CANCEL, band settled",
    async ({ arc, timing }) => {
      const fixture = createFixture([routeT(arc)]);
      const { router, log } = fixture;

      await router.start("/");
      router.subscribeLeave(
        leaveFailingOnce(
          () => new RouterError(errorCodes.TRANSITION_CANCELLED),
          timing,
        ),
      );
      log.length = 0;

      const navigation = router.navigate("t");

      expect(getInternals(router).isTransitioning()).toBe(timing === "async");

      await expect(navigation).rejects.toSatisfy(cancelled);

      expect(log).toStrictEqual(["START:t", "CANCEL:t"]);

      expectSettled(router);

      await expectCleanNext(fixture);
    },
  );

  it.each(TIMINGS)(
    "the TRANSITION_CANCEL names the navigation's pair, and the signal carries the thrown value (%s)",
    async (timing) => {
      const thrown = new RouterError(errorCodes.TRANSITION_CANCELLED);
      const { router } = createFixture([
        {
          name: "t",
          path: "/t",
          canActivate: () => guardFailingOnce(() => thrown, timing),
        },
      ]);
      const pairs: string[] = [];
      let reason: unknown;

      router.usePlugin(() => ({
        onTransitionCancel: (to, from) =>
          pairs.push(`${from?.name}->${to.name}`),
      }));

      await router.start("/");
      router.subscribeLeave(({ signal }) => {
        signal.addEventListener("abort", () => {
          reason = signal.reason;
        });
      });

      await expect(router.navigate("t")).rejects.toBe(thrown);

      expect(pairs).toStrictEqual(["home->t"]);
      expect(reason).toBe(thrown);
    },
  );

  it.each(DOORS)("%s carries the same rule", async (door) => {
    const fixture = createFixture(
      [
        {
          name: "t",
          path: "/t",
          canActivate: () =>
            guardFailingOnce(() => quietCancel("RouterError"), "sync"),
        },
      ],
      "t",
    );
    const { router, log } = fixture;

    await router.start("/b");
    log.length = 0;

    const api = getPluginApi(router);
    const navigation =
      door === "navigateToState"
        ? api.navigateToState(api.matchPath("/t")!)
        : router.navigateToDefault();

    await expect(navigation).rejects.toSatisfy(cancelled);

    expect(log).toStrictEqual(["START:t", "CANCEL:t"]);

    expectSettled(router);
  });

  it("a quiet cancel of the START navigation unwinds the router as a refusal does", async () => {
    const quiet = createFixture([
      {
        name: "t",
        path: "/t",
        canActivate: () =>
          guardFailingOnce(() => quietCancel("RouterError"), "sync"),
      },
    ]);
    const refused = createFixture([
      { name: "t", path: "/t", canActivate: () => () => false },
    ]);

    await expect(quiet.router.start("/t")).rejects.toSatisfy(cancelled);
    await expect(refused.router.start("/t")).rejects.toSatisfy(
      (error) => codeOf(error) === errorCodes.CANNOT_ACTIVATE,
    );

    expect(quiet.log).toStrictEqual(["$start", "START:t", "CANCEL:t", "$stop"]);
    expect(refused.log).toStrictEqual([
      "$start",
      "START:t",
      "ERROR:t:CANNOT_ACTIVATE",
      "$stop",
    ]);
    expect(quiet.router.isActive()).toBe(false);
    expect(refused.router.isActive()).toBe(false);
  });

  it("a navigation started from the signal's abort listener is refused on both arcs", async () => {
    const outcomes: unknown[] = [];

    for (const timing of TIMINGS) {
      const fixture = createFixture([
        {
          name: "t",
          path: "/t",
          canActivate: () =>
            guardFailingOnce(() => quietCancel("RouterError"), timing),
        },
      ]);
      const { router, log } = fixture;

      await router.start("/");
      router.subscribeLeave(({ signal }) => {
        signal.addEventListener("abort", () => {
          outcomes.push(
            codeOf(
              captureSyncThrow(() => {
                void router.navigate("b").catch(() => undefined);
              }),
            ),
          );
        });
      });
      log.length = 0;

      await expect(router.navigate("t")).rejects.toSatisfy(cancelled);

      expect(log).toStrictEqual(["START:t", "CANCEL:t"]);
      expect(router.getState()?.name).toBe("home");

      expectSettled(router);
    }

    expect(outcomes).toStrictEqual([
      errorCodes.REENTRANT_NAVIGATION,
      errorCodes.REENTRANT_NAVIGATION,
    ]);
  });
});

describe("#2787 — a leave listener's failure is a failure, whatever its code", () => {
  it.each(LEAVE_CELLS)(
    "RouterError(ROUTE_NOT_FOUND), $arc arc, $timing: one TRANSITION_ERROR, band settled",
    async ({ arc, timing }) => {
      const fixture = createFixture([routeT(arc)]);
      const { router, log } = fixture;

      await router.start("/");
      router.subscribeLeave(
        leaveFailingOnce(
          () => new RouterError(errorCodes.ROUTE_NOT_FOUND),
          timing,
        ),
      );
      log.length = 0;

      await expect(router.navigate("t")).rejects.toSatisfy(
        (error) => codeOf(error) === errorCodes.ROUTE_NOT_FOUND,
      );

      expect(log).toStrictEqual(["START:t", "ERROR:t:ROUTE_NOT_FOUND"]);

      expectSettled(router);

      await expectCleanNext(fixture);
    },
  );

  it.each(COLLIDING_CODES)(
    "an error of the application's own carrying code %s: one TRANSITION_ERROR, band settled",
    async (code) => {
      const fixture = createFixture([routeT("guard-free")]);
      const { router, log } = fixture;
      const foreign = Object.assign(new Error("foreign"), { code });

      await router.start("/");
      router.subscribeLeave(leaveFailingOnce(() => foreign, "async"));
      log.length = 0;

      await expect(router.navigate("t")).rejects.toBe(foreign);

      expect(log).toStrictEqual(["START:t", `ERROR:t:${code}`]);

      expectSettled(router);

      await expectCleanNext(fixture);
    },
  );
});

describe("#2787 — controls: a navigation the machine has moved past is not moved twice", () => {
  it.each(TIMINGS)(
    "a quiet cancel after a %s redirect leaves the redirect's navigation running",
    async (timing) => {
      const held = heldGuard();
      let redirect: Promise<unknown> | undefined;

      const fixture = createFixture([
        { name: "held", path: "/held", canActivate: () => held.guard },
        {
          name: "redir",
          path: "/redir",
          canActivate: (router) => {
            const redirectThenCancel = (): never => {
              redirect = router.navigate("held");

              throw new RouterError(errorCodes.TRANSITION_CANCELLED);
            };

            return timing === "sync"
              ? redirectThenCancel
              : async () => {
                  await Promise.resolve();

                  return redirectThenCancel();
                };
          },
        },
      ]);
      const { router, log } = fixture;

      await router.start("/");
      log.length = 0;

      await expect(router.navigate("redir")).rejects.toSatisfy(cancelled);

      // The redirect is the navigation in flight now — the quiet cancel above
      // belongs to the one it superseded.
      expect(getInternals(router).isTransitioning()).toBe(true);

      held.release(true);
      await redirect;

      expect(log).toStrictEqual([
        "START:redir",
        "CANCEL:redir",
        "START:held",
        "SUCCESS:held",
      ]);
      expect(router.getState()?.name).toBe("held");
    },
  );

  it("a quiet-cancelling guard superseded by a navigation still in flight: only the superseded one is cancelled", async () => {
    const held = heldGuard();
    let rejectGuard!: (reason: unknown) => void;
    const fixture = createFixture([
      {
        name: "t",
        path: "/t",
        canActivate: () => () =>
          new Promise<boolean>((_resolve, reject) => {
            rejectGuard = reject;
          }),
      },
    ]);
    const { router, log } = fixture;

    getLifecycleApi(router).addActivateGuard("b", () => held.guard);

    await router.start("/");
    log.length = 0;

    const first = router.navigate("t");
    const second = router.navigate("b");

    rejectGuard(new RouterError(errorCodes.TRANSITION_CANCELLED));

    await expect(first).rejects.toSatisfy(cancelled);

    // `b` is the navigation in flight while `t` settles.
    expect(getInternals(router).isTransitioning()).toBe(true);

    held.release(true);
    await second;

    expect(log).toStrictEqual(["START:t", "CANCEL:t", "START:b", "SUCCESS:b"]);

    expectSettled(router);
  });

  it("a guard that redirects to a held route and then refuses leaves the redirect running", async () => {
    const held = heldGuard();
    let redirect: Promise<unknown> | undefined;
    const fixture = createFixture([
      { name: "held", path: "/held", canActivate: () => held.guard },
      {
        name: "redir",
        path: "/redir",
        canActivate: (router) => () => {
          redirect = router.navigate("held");

          return false;
        },
      },
    ]);
    const { router, log } = fixture;

    await router.start("/");
    log.length = 0;

    // The code the refused navigation rejects with is pinned by
    // `redirect-then-refuse-2788.test.ts`; what this pins is that its stale
    // FAIL does not reach the redirect's band.
    await router.navigate("redir").catch(() => undefined);

    held.release(true);
    await redirect;

    expect(log).toStrictEqual([
      "START:redir",
      "CANCEL:redir",
      "START:held",
      "SUCCESS:held",
    ]);
    expect(router.getState()?.name).toBe("held");
  });

  it("a navigation started inside completeTransition's own FAIL keeps running: the stale FAIL is refused", async () => {
    const fixture = createFixture([
      { name: "page", path: "/page" },
      { name: "held", path: "/held" },
    ]);
    const { router, log } = fixture;
    const page = heldGuard();
    const held = heldGuard();
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("page", () => page.guard);
    lifecycle.addActivateGuard("held", () => held.guard);

    await router.start("/");
    log.length = 0;

    const { signal, started } = signalThatNavigates(router, "held");
    const first = router
      .navigate("page", {}, undefined, { signal })
      .catch(codeOf);

    getRoutesApi(router).remove("page");
    page.release(true);

    await expect(first).resolves.toBe(errorCodes.ROUTE_NOT_FOUND);

    held.release(true);

    await expect(started()).resolves.toBe("held");
    expect(log).toStrictEqual([
      "START:page",
      "START:held",
      "ERROR:page:ROUTE_NOT_FOUND",
      "SUCCESS:held",
    ]);
  });

  it("completeTransition's own ROUTE_NOT_FOUND is reported once, and a restart started inside its FAIL is not failed", async () => {
    const fixture = createFixture([{ name: "page", path: "/page" }]);
    const { router, log } = fixture;
    const starts = parkStarts(router);
    const page = heldGuard();

    getLifecycleApi(router).addActivateGuard("page", () => page.guard);

    await router.start("/");
    starts.park();
    log.length = 0;

    const { signal, restart } = signalThatRestarts(router, "/b");
    const navigation = router
      .navigate("page", {}, undefined, { signal })
      .catch(codeOf);

    getRoutesApi(router).remove("page");
    page.release(true);

    await expect(navigation).resolves.toBe(errorCodes.ROUTE_NOT_FOUND);

    starts.release();

    await expect(restart()).resolves.toBe("b");
    expect(log.filter((entry) => entry.startsWith("ERROR"))).toStrictEqual([
      "ERROR:page:ROUTE_NOT_FOUND",
    ]);
  });
});
