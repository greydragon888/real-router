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

import { describe, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { hydrateRouter } from "@real-router/core/utils";

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
    it("does NOT ban a sync navigate() from onStart; it is superseded by the start navigation", async () => {
      const router = createRouter([
        { name: "a", path: "/a" },
        { name: "b", path: "/b" },
      ]);

      let navOutcome = "(not called)";

      router.usePlugin(() => ({
        onStart() {
          // ROUTER_START does not raise dispatchDepth, so this is NOT a reentrant
          // navigation (contrast the §4 ban from transition listeners, #1181).
          // It is accepted, then silently superseded by the start navigation.
          // (The superseded navigate('b') rejection is fire-and-forget-suppressed
          // by core, #721 — no unhandled rejection.)
          const thrown = captureSyncThrow(() => router.navigate("b"));

          navOutcome =
            thrown === undefined
              ? "accepted"
              : `banned:${(thrown as { code?: string }).code}`;
        },
      }));

      const state = await router.start("/a");

      // navigate('b') was accepted (not banned)...
      expect(navOutcome).toBe("accepted");
      // ...but the start navigation wins: final committed state is the start path.
      expect(state.name).toBe("a");
      expect(router.getState()?.name).toBe("a");

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
