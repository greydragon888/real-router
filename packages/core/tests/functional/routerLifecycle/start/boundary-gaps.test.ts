// #1190 — start() boundary gaps found by the start deep-audit (§5/§6): none of
// these paths were exercised anywhere in the suite. Each pins a *documented but
// untested* start-lifecycle contract.
//
// Two cells the audit surfaced were reclassified as bugs (filed separately) and
// are now FIXED + green-pinned:
//   • interceptor that never calls next() → raw sync TypeError from
//     `internalStart.catch` on undefined (#1411) — pinned in the "start
//     interceptor" describe below.
//   • async (rejected-promise) Plugin.onStart leaked an unhandledRejection
//     instead of isolating it like `subscribe`/#944 (#1412) — the emitter now
//     isolates async listener rejections centrally; pinned in
//     error-handling.test.ts (next to the sync-throw onStart isolation).

import { hydrateRouter } from "@real-router/ssr-utils";
import { describe, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { captureSyncThrow, createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core";

describe("router.start() - boundary gaps (#1190)", () => {
  describe("path with a hash fragment", () => {
    let router: Router;

    afterEach(() => {
      router.stop();
    });

    it("strips the #fragment and matches the bare path (segment route)", async () => {
      router = createTestRouter();

      const state = await router.start("/users#section");

      expect(state.name).toBe("users");
      expect(state.path).toBe("/users"); // fragment dropped, not carried into state
    });

    it("strips the #fragment and matches the bare path (nested route)", async () => {
      router = createTestRouter();

      const state = await router.start("/users/list#top");

      expect(state.name).toBe("users.list");
      expect(state.path).toBe("/users/list");
    });
  });

  describe("onStart plugin hook", () => {
    // ⚠ This block used to assert the OUTCOME ("accepted", final state `a`) under
    // the title "it is superseded by the start navigation", and both the title
    // and its comment were WRONG about the mechanism — measured on #1661: there
    // was no supersede and no rejection. `navigate('b')` ran to completion,
    // committed, and announced `TRANSITION_SUCCESS` to every subscriber; the
    // boot then overwrote it. The assertion could not see that, because the
    // phantom and the fix agree on everything it looked at — the call throws
    // nothing either way and the final state is `a` either way. #1190 asked for
    // coverage of this arc and got a green test over a live defect.
    //
    // What discriminates is the LEDGER of what subscribers were handed.
    it.each([
      ["navigate", (r: Router) => r.navigate("b")],
      ["navigateToDefault", (r: Router) => r.navigateToDefault()],
      [
        "navigateToState",
        (r: Router) => {
          const api = getPluginApi(r);

          return api.navigateToState(api.makeState("b"));
        },
      ],
    ])(
      "refuses %s from onStart — nothing may commit before the start navigation does (#1661)",
      async (_label, drive) => {
        const router = createRouter(
          [
            { name: "a", path: "/a" },
            { name: "b", path: "/b" },
          ],
          { defaultRoute: "b" },
        );

        const announced: string[] = [];
        let navOutcome = "(not called)";
        let settled = "(not settled)";

        router.subscribe(({ route }) => announced.push(route.name));

        router.usePlugin(() => ({
          onStart() {
            // ROUTER_START does not raise dispatchDepth, so this is NOT the §4
            // reentrancy ban (#1181) — it is the start window's own precondition.
            const thrown = captureSyncThrow(() => {
              drive(router).then(
                () => (settled = "resolved"),
                (error: unknown) =>
                  (settled = `rejected:${(error as { code?: string }).code}`),
              );
            });

            navOutcome =
              thrown === undefined
                ? "accepted"
                : `threw:${(thrown as { code?: string }).code}`;
          },
        }));

        const state = await router.start("/a");

        // Refused as a REJECTION, not a sync throw: `navigate` reports failure
        // through its promise, and changing that shape here would break every
        // caller written against it (the sibling `navigateToNotFound` refusal of
        // #1644 throws because that primitive is synchronous).
        expect(navOutcome).toBe("accepted");
        expect(settled).toBe(`rejected:${errorCodes.ROUTER_NOT_STARTED}`);

        // The half with the discriminating power: no subscriber was ever handed
        // a state other than the one `start()` settled on.
        expect(announced).toStrictEqual(["a"]);
        expect(state.name).toBe("a");
        expect(router.getState()?.name).toBe("a");

        router.dispose();
      },
    );

    // #1662 — the same window's OTHER symptom, and a different contract: not
    // what subscribers were handed, but what `start()`'s own promise says. When
    // the nested navigation targeted the boot's OWN route it committed first,
    // the boot's `navigateToState` then met its same-state check and refused, and
    // `await start()` threw over a router that was active and holding exactly the
    // right state. `#unwindFailedStart` correctly left it alone (a state IS
    // committed — #763), so nothing was broken except the promise.
    //
    // Kept apart from the table above on purpose: that one asserts the ledger and
    // would stay green on a run where the boot is refused rather than overwritten.
    it.each([
      ["navigate", (r: Router) => r.navigate("a")],
      ["navigateToDefault", (r: Router) => r.navigateToDefault()],
      [
        "navigateToState",
        (r: Router) => {
          const api = getPluginApi(r);

          return api.navigateToState(api.makeState("a"));
        },
      ],
    ])(
      "start() does not lie when onStart drives %s at the BOOT route (#1662)",
      async (_label, drive) => {
        const router = createRouter(
          [
            { name: "a", path: "/a" },
            { name: "b", path: "/b" },
          ],
          { defaultRoute: "a" },
        );

        router.usePlugin(() => ({
          onStart() {
            drive(router).catch(() => {
              /* refused by the window's precondition */
            });
          },
        }));

        const state = await router.start("/a");

        // The promise and the router agree — that is the whole contract here.
        expect(state.name).toBe("a");
        expect(router.getState()?.name).toBe("a");
        expect(router.isActive()).toBe(true);

        router.dispose();
      },
    );

    it("still allows a navigate() from a GUARD of the start navigation (the classic redirect)", async () => {
      // The other side of the #1661 predicate, and the reason it reads
      // `isTransitioning()` rather than just "nothing committed": from `onStart`
      // that is false, from a guard of the boot navigation it is true. Both run
      // on a READY machine with no committed state, so FSM state alone cannot
      // tell them apart.
      const router = createRouter([
        {
          name: "a",
          path: "/a",
          canActivate: (r) => () => {
            r.navigate("b").catch(() => {
              /* superseded by nothing; the redirect wins */
            });

            return true;
          },
        },
        { name: "b", path: "/b" },
      ]);

      const announced: string[] = [];

      router.subscribe(({ route }) => announced.push(route.name));

      await expect(router.start("/a")).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(announced).toStrictEqual(["b"]);
      expect(router.getState()?.name).toBe("b");

      router.dispose();
    });

    it("rejects a recursive start() from onStart with ALREADY_STARTED; the original start wins", async () => {
      const router = createRouter([
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ]);

      let recursiveCode = "(not settled)";

      router.usePlugin(() => ({
        onStart() {
          router.start("/b").then(
            () => {
              recursiveCode = "resolved";
            },
            (error: unknown) => {
              recursiveCode = (error as { code?: string }).code ?? "unknown";
            },
          );
        },
      }));

      const state = await router.start("/a");

      expect(state.name).toBe("a");

      // Let the recursive start() settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(recursiveCode).toBe(errorCodes.ROUTER_ALREADY_STARTED);
      expect(router.getState()?.name).toBe("a"); // original start committed

      router.dispose();
    });
  });

  describe("start interceptor", () => {
    it("second next() call rejects SAME_STATES; the first next() already committed", async () => {
      const router = createRouter([{ name: "home", path: "/home" }]);

      getPluginApi(router).addInterceptor("start", async (next, path) => {
        await next(path); // commits → TRANSITION_SUCCESS

        return next(path); // same path again → SAME_STATES
      });

      // The doubled next() surfaces the second navigation's SAME_STATES rejection.
      await expect(router.start("/home")).rejects.toMatchObject({
        code: errorCodes.SAME_STATES,
      });

      // But the first next() committed — the router is started and on '/home'
      // (post-commit failure keeps observed success, #763-shape).
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");

      router.dispose();
    });

    it("returns a cleanly-rejecting promise instead of a raw sync TypeError when an interceptor never calls next() (#1411)", async () => {
      const router = createRouter([{ name: "home", path: "/home" }]);

      // A start interceptor that returns without calling next() (undefined). The
      // interceptor is typed Promise<State>, so modelling the misuse needs a
      // cast. Pre-fix, `internalStart.catch` dereferences the undefined return
      // and throws a raw synchronous TypeError; the FSM sticks in STARTING.
      getPluginApi(router).addInterceptor(
        "start",
        (): Promise<State> => undefined as unknown as Promise<State>,
      );

      await expect(router.start("/home")).rejects.toThrow(
        /returned without calling next/,
      );
      expect(router.isActive()).toBe(false);

      router.dispose();
    });
  });

  describe("concurrent hydrateRouter()", () => {
    it("two concurrent hydrations — one starts, the other rejects ALREADY_STARTED", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "a", path: "/a" },
      ]);
      const serialized = JSON.stringify({ name: "a", params: {}, path: "/a" });

      const [first, second] = await Promise.allSettled([
        hydrateRouter(router, serialized),
        hydrateRouter(router, serialized),
      ]);

      // Exactly one hydration wins; the other is rejected ALREADY_STARTED.
      const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
      const rejected = [first, second].filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as { code?: string }).code).toBe(
        errorCodes.ROUTER_ALREADY_STARTED,
      );
      expect(router.getState()?.name).toBe("a");

      router.dispose();
    });
  });
});
