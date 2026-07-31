import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { captureUnhandledRejections, createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

/**
 * #721 fire-and-forget safety, POSITIVE half: navigation methods called without
 * `await` must internally suppress EXPECTED rejections (a suppressed RouterError
 * code) so no process-level `unhandledRejection` leaks
 * and no spurious "Unexpected navigation error" is logged for them. (A genuinely
 * unexpected navigate rejection — e.g. a subscribeLeave listener that throws —
 * is NOT suppressed and DOES log under "router.navigate"; start failures log
 * under "router.start", #931.)
 *
 * Suppression lives in `NavigationNamespace` (Step 0 of the two-pipelines RFC),
 * not in the facade: the layer that CREATES a promise is the only one that can
 * tell a fresh rejection from one of its own pre-suppressed singletons. The
 * former `lastSyncResolved`/`lastSyncRejected` side channel is gone — a
 * synchronously-settled navigation now says so by RETURNING a `State`, and the
 * pre-suppressed ones are recognised by IDENTITY (`PRE_SUPPRESSED`).
 *
 * ⚠ The behavioural tests below cannot pin the identity check: dropping it only
 * makes the router attach a redundant `.catch()`, which is invisible to every
 * assertion here (verified by mutation — the whole suite stays green). That
 * property is pinned by COUNTING instead, in the last test of this block.
 */
let router: Router;

describe("#721 fire-and-forget — no unhandledRejection leaks", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("a cached sync rejection (route not found) does not leak", async () => {
    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("does-not-exist");
    });

    expect(leaked).toStrictEqual([]);
  });

  it("a sync SAME_STATES rejection does not leak", async () => {
    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("home");
    });

    expect(leaked).toStrictEqual([]);
  });

  it("an async guard block (CANNOT_ACTIVATE) does not leak", async () => {
    getLifecycleApi(router).addActivateGuard(
      "users",
      () => () => Promise.resolve(false),
    );

    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("users");
    });

    expect(leaked).toStrictEqual([]);
  });

  it("a cached sync rejection followed by an async rejection does not leak", async () => {
    // The shape that broke under the retired flag: call 1 returned a cached
    // (pre-suppressed) rejection and call 2 an async one. With a flag, call 1
    // could leave it stale-true and call 2 would skip suppression and leak.
    // Under identity there is no state to go stale — call 2's promise is simply
    // not in `PRE_SUPPRESSED` — but the sequence stays pinned: it is the exact
    // ordering that regressed as #721.
    getLifecycleApi(router).addActivateGuard(
      "users",
      () => () => Promise.resolve(false),
    );

    const leaked = await captureUnhandledRejections(() => {
      void router.navigate("does-not-exist"); // cached sync reject
      void router.navigate("users"); // async reject (CANNOT_ACTIVATE)
    });

    expect(leaked).toStrictEqual([]);
  });

  it("attaches NO second .catch() to a pre-suppressed cached rejection", async () => {
    // The one property in this file that behaviour cannot express. The cached
    // singletons carry a `.catch()` from module load, so they can never raise an
    // `unhandledRejection` — re-suppressing them prevents nothing and only
    // allocates a derived promise (~40 ns, ~12.5% of a SAME_STATES navigate).
    // Dropping the identity check is therefore INVISIBLE to every other
    // assertion here; it is only observable by counting the `.catch()` calls.
    //
    // Counted through the public API, without reaching into core. The singleton
    // is stable across calls (pinned by the identity block below), so the first
    // navigate hands out the very object the second one will reuse — an own
    // `catch` property on it shadows the prototype method for that ONE object,
    // leaving the global prototype untouched.
    const cached = router.navigate("home"); // SAME_STATES → the cached singleton
    const passThrough = cached.catch.bind(cached);
    let attached = 0;

    // `void`: defineProperty returns its target, which here is a Promise
    void Object.defineProperty(cached, "catch", {
      configurable: true,
      value: (...args: Parameters<typeof passThrough>) => {
        attached += 1;

        return passThrough(...args);
      },
    });

    try {
      const second = router.navigate("home");

      void second; // the object we already hold; asserted on below and awaited

      expect(second).toBe(cached); // same singleton back
    } finally {
      Reflect.deleteProperty(cached, "catch");
    }

    expect(attached).toBe(0);

    await expect(cached).rejects.toMatchObject({
      code: errorCodes.SAME_STATES,
    });
  });

  it("suppresses navigateToDefault's rejection ONCE, not once per layer", async () => {
    // `navigateToDefault` delegates to the namespace's PRIVATE navigate core.
    // Routing it through the public `navigate` instead would run the
    // fire-and-forget checkpoint twice — once inside, once in its own wrapper —
    // and attach a second, pointless `.catch()` to every default navigation.
    // Behaviour is identical either way (the extra suppression is a no-op), so
    // only counting sees it; measured, the wrong wiring gives 2.
    //
    // The promise is created INSIDE the call, so it cannot be captured first:
    // record every `.catch()` receiver during the call, then count the ones that
    // landed on the promise handed back. A Proxy keeps the receiver a parameter
    // rather than a bare `this`.
    // A local router: the shared one defaults to "home" and is already there,
    // which would answer with the cached SAME_STATES singleton (0 attachments)
    // and measure nothing. The default must be a route it can actually attempt.
    const local = createTestRouter({ defaultRoute: "users" });

    await local.start("/home");
    getLifecycleApi(local).addActivateGuard(
      "users",
      () => () => Promise.resolve(false),
    );

    const original = Promise.prototype.catch;
    const receivers: unknown[] = [];
    let returned: Promise<unknown>;

    try {
      Promise.prototype.catch = new Proxy(original, {
        apply(target, thisArg, args: Parameters<typeof original>) {
          receivers.push(thisArg);

          return Reflect.apply(target, thisArg, args);
        },
      });

      returned = local.navigateToDefault();
    } finally {
      Promise.prototype.catch = original;
    }

    expect(receivers.filter((seen) => seen === returned)).toHaveLength(1);

    await expect(returned).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });

    local.stop();
  });
});

/**
 * #1605 — `start()`'s own half of the same contract.
 *
 * The suppressor used to be attached at the BOTTOM of `start()`, below an early
 * `return Promise.reject(CACHED_ALREADY_STARTED_ERROR)`. So the one rejection
 * that leaves the method first was the one nothing covered: a second, unawaited
 * `start()` raised an `unhandledRejection`, which under Node 22+'s default
 * `--unhandled-rejections=throw` terminates the process — with a stack pointing
 * at the cached error's module constant, not at the caller.
 *
 * Fixed the way Step 0 fixed the navigate family: ONE checkpoint per public
 * method, so no return site can be missed. These tests pin both halves — that
 * nothing leaks, and that a caller's own no-op is not reported as a fault.
 */
describe("#1605 fire-and-forget — start()", () => {
  it("a second, unawaited start() does not leak an unhandledRejection", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const leaked = await captureUnhandledRejections(() => {
      void router.start("/home");
    });

    router.stop();

    expect(leaked).toStrictEqual([]);
  });

  it("stays silent — ALREADY_STARTED is a caller-owned outcome, not a fault", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    void router.start("/home");

    // let the suppressing .catch() run
    await Promise.resolve();
    await Promise.resolve();

    const messages = errorSpy.mock.calls.map((call) => String(call[0]));

    errorSpy.mockRestore();
    router.stop();

    expect(messages).toStrictEqual([]);
  });

  it("still rejects for an awaiting caller", async () => {
    const router = createTestRouter();

    await router.start("/home");

    await expect(router.start("/home")).rejects.toMatchObject({
      code: errorCodes.ROUTER_ALREADY_STARTED,
    });

    router.stop();
  });
});

// #1184: the zero-allocation cached-rejection fast path
// (CACHED_SAME_STATES_REJECTION / CACHED_NOT_STARTED_REJECTION /
// CACHED_ROUTE_NOT_FOUND_REJECTION, NavigationNamespace/constants.ts) returns a
// SHARED singleton promise + error per rejection class. Every other test compares
// by VALUE (.rejects.toMatchObject({ code })), so silently replacing a singleton
// with a per-call `Promise.reject(new RouterError(...))` — losing BOTH the
// optimization AND the #721 pre-suppression contract (the singleton is what
// `PRE_SUPPRESSED` recognises, so a per-call reject would silently start paying
// for a `.catch()` again) — passes the whole suite. Pin IDENTITY through the
// public API: two triggering navigations return the SAME promise + error ref.
// This also pins that the facade hands the singleton back UNWRAPPED: wrapping it
// in a fresh promise would break `toBe` here.
describe("cached-rejection identity (#1184 — zero-alloc fast path)", () => {
  it("SAME_STATES: two same-state navigations return the SAME promise + error instance", async () => {
    const router = createTestRouter();

    await router.start("/home");

    const r1 = router.navigate("home");
    const r2 = router.navigate("home");

    expect(r1).toBe(r2); // CACHED_SAME_STATES_REJECTION singleton

    const [error1, error2] = await Promise.all([
      r1.catch((error: unknown) => error),
      r2.catch((error: unknown) => error),
    ]);

    expect(error1).toBe(error2); // CACHED_SAME_STATES_ERROR singleton
    expect((error1 as { code?: string }).code).toBe(errorCodes.SAME_STATES);

    router.stop();
  });

  it("ROUTER_NOT_STARTED: two pre-start navigations return the SAME promise + error instance", async () => {
    const router = createTestRouter();

    const r1 = router.navigate("users");
    const r2 = router.navigate("users");

    expect(r1).toBe(r2); // CACHED_NOT_STARTED_REJECTION singleton

    const [error1, error2] = await Promise.all([
      r1.catch((error: unknown) => error),
      r2.catch((error: unknown) => error),
    ]);

    expect(error1).toBe(error2); // CACHED_NOT_STARTED_ERROR singleton
    expect((error1 as { code?: string }).code).toBe(
      errorCodes.ROUTER_NOT_STARTED,
    );

    router.dispose();
  });

  it("ROUTE_NOT_FOUND: two unknown-route navigations return the SAME promise + error instance", async () => {
    const router = createTestRouter({ allowNotFound: false });

    await router.start("/home");

    const r1 = router.navigate("nonexistent.route");
    const r2 = router.navigate("nonexistent.route");

    expect(r1).toBe(r2); // CACHED_ROUTE_NOT_FOUND_REJECTION singleton

    const [error1, error2] = await Promise.all([
      r1.catch((error: unknown) => error),
      r2.catch((error: unknown) => error),
    ]);

    expect(error1).toBe(error2); // CACHED_ROUTE_NOT_FOUND_ERROR singleton
    expect((error1 as { code?: string }).code).toBe(errorCodes.ROUTE_NOT_FOUND);

    router.stop();
  });
});
