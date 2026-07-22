import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import {
  arbNavigableRoute,
  createFixtureRouter,
  createStartedRouter,
  NUM_RUNS,
} from "./helpers";

import type { Route, Router, State } from "@real-router/core";

/**
 * Property-based coverage for `router.subscribeLeave()`.
 *
 * Example-based suites pin a handful of fixed listener counts / routes; these
 * properties exercise the registration / invocation / unsubscribe machinery
 * across a generated range of N (and the full non-function input space), plus
 * the payload / signal contract over every navigable target.
 *
 * Merged from the former `subscribe-leave.properties.ts` + this file (#1200
 * item 12): they differed only by hyphenation and duplicated the non-function
 * `TypeError` guard.
 */

interface LeavePayload {
  route: State;
  nextRoute: State;
  signal: AbortSignal;
}

function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view" || name === "users.edit") {
    return { id: "abc" };
  }

  if (name === "search") {
    return { q: "test", page: "1" };
  }

  return {};
}

describe("subscribeLeave() properties", () => {
  describe("validation invariant", () => {
    // TYPEOF_GUARD — parity with subscribe(): subscribeLeave is an always-on
    // invariant guard (no plugin required). Any non-function listener throws
    // TypeError synchronously, before it can be pushed onto the leave-listener
    // array and crash on a later navigation. `fc.anything()` covers the full
    // corruption surface; `typeof x !== "function"` keeps only the rejected set.
    // The router is never mutated (every call throws before registration), so a
    // single fixture instance is reused across all runs.
    const router = createFixtureRouter();

    test.prop([fc.anything().filter((v) => typeof v !== "function")], {
      numRuns: NUM_RUNS.standard,
    })("throws TypeError for any non-function listener", (notAFunction) => {
      expect(() => router.subscribeLeave(notAFunction as never)).toThrow(
        TypeError,
      );
    });
  });

  describe("invocation invariants", () => {
    test.prop([fc.integer({ min: 1, max: 20 })], { numRuns: NUM_RUNS.fast })(
      "N registered listeners each fire exactly once per leave",
      async (n) => {
        const router = await createStartedRouter("/");
        const spies = Array.from({ length: n }, () => vi.fn());

        spies.forEach((s) => router.subscribeLeave(s));

        await router.navigate("admin.settings");

        spies.forEach((s) => {
          expect(s).toHaveBeenCalledTimes(1);
        });

        router.stop();
      },
    );

    test.prop([fc.integer({ min: 2, max: 12 })], { numRuns: NUM_RUNS.fast })(
      "listeners fire in registration order",
      async (n) => {
        const router = await createStartedRouter("/");
        const order: number[] = [];

        for (let i = 0; i < n; i++) {
          const idx = i;

          router.subscribeLeave(() => {
            order.push(idx);
          });
        }

        await router.navigate("admin.settings");

        expect(order).toStrictEqual(Array.from({ length: n }, (_, i) => i));

        router.stop();
      },
    );

    test.prop(
      [fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0, max: 10 })],
      {
        numRuns: NUM_RUNS.fast,
      },
    )(
      "after unsubscribing K of N listeners, exactly the remaining N-K fire",
      async (n, kRaw) => {
        const k = Math.min(kRaw, n);
        const router = await createStartedRouter("/");
        const spies = Array.from({ length: n }, () => vi.fn());
        const unsubs = spies.map((s) => router.subscribeLeave(s));

        for (let i = 0; i < k; i++) {
          unsubs[i]();
        }

        await router.navigate("admin.settings");

        spies.forEach((s, i) => {
          expect(s).toHaveBeenCalledTimes(i < k ? 0 : 1);
        });

        router.stop();
      },
    );
  });

  describe("payload & signal", () => {
    // LEAVE_PAYLOAD — for an arbitrary confirmed departure, the listener fires
    // exactly once with `{ route: fromState, nextRoute: toState, signal }`. The
    // shape is generalized over every navigable target (the functional suite pins
    // it only for fixed routes).
    test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
      "fires once with {route, nextRoute, signal} on confirmed departure",
      async (targetRoute) => {
        fc.pre(targetRoute !== "home");

        const router = await createStartedRouter("/");
        const fromState = router.getState();
        const listener = vi.fn();

        router.subscribeLeave(listener);

        await router.navigate(targetRoute, getParamsForRoute(targetRoute));

        expect(listener).toHaveBeenCalledTimes(1);

        const payload = listener.mock.calls[0][0] as LeavePayload;

        // Departure is from the previously committed state, arrival is the target.
        expect(payload.route.name).toBe(fromState?.name);
        expect(payload.nextRoute.name).toBe(targetRoute);
        expect(payload.nextRoute).toBe(router.getState());
        expect(payload.signal).toBeInstanceOf(AbortSignal);

        router.stop();
      },
    );

    // SIGNAL_UNABORTED_ON_SUCCESS — the leave signal aborts ONLY on cancellation,
    // never on success (#722). A listener that captures the signal observes
    // `aborted === false` after the navigation commits.
    test.prop([arbNavigableRoute], { numRuns: NUM_RUNS.standard })(
      "captured signal stays unaborted after a successful navigation",
      async (targetRoute) => {
        fc.pre(targetRoute !== "home");

        const router = await createStartedRouter("/");
        let captured: AbortSignal | undefined;

        router.subscribeLeave(({ signal }) => {
          captured = signal;
        });

        await router.navigate(targetRoute, getParamsForRoute(targetRoute));

        expect(captured).toBeInstanceOf(AbortSignal);
        expect(captured?.aborted).toBe(false);

        router.stop();
      },
    );
  });

  // ===========================================================================
  // #1200 items 6-9 — cancellation / ordering / no-fire invariants, generalized
  // over generated inputs (the functional suite pins only fixed cases). Each is
  // mutation-proven: an oracle independent of the leave machinery, a generator
  // that reaches the discriminating class (cancel-source × N, thrower position,
  // bypass scenario), and a src mutation that reds the property.
  // ===========================================================================
  describe("cancellation, ordering & no-fire (#1200 items 6-9)", () => {
    // Param-free navigable targets (users.view/edit need :id — excluded here).
    const arbGuardTarget = fc.constantFrom(
      "users.list",
      "admin.dashboard",
      "admin.settings",
      "search",
    );

    const ABC: Route[] = [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
      { name: "c", path: "/c" },
    ];
    const AB: Route[] = [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ];

    // item 6 — TENTATIVE_DEPARTURE reject-half (#932/#943). For any target with a
    // rejecting activation guard: the leave listener fires (departure approved),
    // but activation rejects → state stays `fromState` AND the captured signal
    // aborts with RouterError(CANNOT_ACTIVATE). Generalizes F2/F6 over targets.
    test.prop([arbGuardTarget], { numRuns: NUM_RUNS.standard })(
      "reject-half: leave fires, state stays fromState, signal aborts CANNOT_ACTIVATE",
      async (target) => {
        const router = await createStartedRouter("/"); // committed at home

        getLifecycleApi(router).addActivateGuard(target, () => () => false);

        let fired = false;
        let signal: AbortSignal | undefined;

        router.subscribeLeave((payload) => {
          fired = true;
          signal = payload.signal;
        });

        const error = await router.navigate(target).then(
          () => undefined,
          (error_: unknown) => error_,
        );

        expect(fired).toBe(true); // departure was approved (leave fired)
        expect(router.getState()?.name).toBe("home"); // activation rejected → stay
        expect(signal?.aborted).toBe(true);
        expect((signal?.reason as { code?: string })?.code).toBe(
          errorCodes.CANNOT_ACTIVATE,
        );
        expect((error as { code?: string })?.code).toBe(
          errorCodes.CANNOT_ACTIVATE,
        );

        router.dispose();
      },
    );

    // item 7 — SIGNAL_ABORT_PROPAGATES. N pending async leave listeners × every
    // cancel source (supersede / stop / dispose / external opts.signal) → each of
    // the PARKED navigation's captured signals aborts (read the listener's signal,
    // not just the behavioral rejection).
    test.prop(
      [
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom("supersede", "stop", "dispose", "external"),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "every cancel source aborts each pending leave listener's captured signal",
      async (n, action) => {
        const router: Router = createRouter(ABC, { defaultRoute: "a" });

        await router.start("/a");

        const signals: AbortSignal[] = [];

        for (let i = 0; i < n; i++) {
          // Park in LEAVE_APPROVED — never settle — after capturing the signal.
          router.subscribeLeave(
            ({ signal }) =>
              new Promise<void>(() => {
                signals.push(signal);
              }),
          );
        }

        const controller = new AbortController();
        const opts = action === "external" ? { signal: controller.signal } : {};
        const parked = router.navigate("b", {}, undefined, opts);

        parked.catch(() => {});
        await Promise.resolve();
        await Promise.resolve();

        switch (action) {
          case "supersede": {
            router.navigate("c").catch(() => {});

            break;
          }
          case "stop": {
            router.stop();

            break;
          }
          case "dispose": {
            router.dispose();

            break;
          }
          default: {
            controller.abort(new Error("external cancel"));
          }
        }

        await Promise.resolve();
        await Promise.resolve();

        // A supersede re-fires the listeners for its own (uncancelled) nav, so
        // assert only the PARKED navigation's first n signals.
        expect(signals.length).toBeGreaterThanOrEqual(n);

        signals.slice(0, n).forEach((s) => {
          expect(s.aborted).toBe(true);
        });

        if (action !== "dispose") {
          router.dispose();
        }
      },
    );

    // item 8 — AWAIT_BLOCKS_ACTIVATION (ordering only). Activation guards run only
    // AFTER all N async leave listeners settle, for any N. No timing assertion —
    // "≈ max not sum" is flaky under concurrency (#1423); the ordering is the
    // invariant.
    test.prop([fc.integer({ min: 1, max: 6 })], { numRuns: NUM_RUNS.standard })(
      "activation runs after all N async leave listeners settle",
      async (n) => {
        const router: Router = createRouter(AB, { defaultRoute: "a" });

        await router.start("/a");

        const order: string[] = [];

        for (let i = 0; i < n; i++) {
          router.subscribeLeave(async () => {
            await Promise.resolve();
            order.push(`leave${i}`);
          });
        }

        getLifecycleApi(router).addActivateGuard("b", () => () => {
          order.push("activate");

          return true;
        });

        await router.navigate("b");

        expect(order).toHaveLength(n + 1);
        // Activation is last; every leave listener recorded before it.
        expect(order[order.length - 1]).toBe("activate");

        for (let i = 0; i < n; i++) {
          expect(order.indexOf(`leave${i}`)).toBeLessThan(
            order.indexOf("activate"),
          );
        }

        router.dispose();
      },
    );

    // item 9a — SYNC_THROW_PRIORITY. Among N listeners (one sync-throwing at any
    // position, the rest async-rejecting), navigate rejects with the SYNC error —
    // a sync throw wins over every async rejection regardless of position.
    test.prop(
      [fc.integer({ min: 3, max: 6 }), fc.integer({ min: 0, max: 5 })],
      {
        numRuns: NUM_RUNS.standard,
      },
    )(
      "a sync leave throw wins over async rejections (any position)",
      async (n, posRaw) => {
        const pos = posRaw % n;
        const router: Router = createRouter(AB, { defaultRoute: "a" });

        await router.start("/a");

        for (let i = 0; i < n; i++) {
          if (i === pos) {
            router.subscribeLeave(() => {
              throw new Error("SYNC_WINS");
            });
          } else {
            router.subscribeLeave(async () => {
              throw new Error(`async${i}`);
            });
          }
        }

        const error = await router.navigate("b").then(
          () => undefined,
          (error_: unknown) => error_,
        );

        expect((error as Error)?.message).toBe("SYNC_WINS");

        router.dispose();
      },
    );

    // item 9b — NO_FIRE_ON. The leave listener does NOT fire when there is no
    // approved departure — a blocking deactivation guard, a same-state navigation,
    // or navigateToNotFound (pipeline bypass).
    test.prop([fc.constantFrom("deactivate", "same-state", "not-found")], {
      numRuns: NUM_RUNS.standard,
    })(
      "leave does not fire on deactivate-block / same-state / notFound",
      async (scenario) => {
        const router: Router = createRouter(AB, { defaultRoute: "a" });

        await router.start("/a");

        if (scenario === "deactivate") {
          getLifecycleApi(router).addDeactivateGuard("a", () => () => false);
        }

        const onLeave = vi.fn();

        router.subscribeLeave(onLeave);

        if (scenario === "not-found") {
          router.navigateToNotFound("/nope");
        } else if (scenario === "same-state") {
          await router.navigate("a").catch(() => {});
        } else {
          await router.navigate("b").catch(() => {});
        }

        expect(onLeave).not.toHaveBeenCalled();

        router.dispose();
      },
    );
  });
});
