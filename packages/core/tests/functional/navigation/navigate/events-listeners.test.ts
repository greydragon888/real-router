import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, errorCodes } from "@real-router/core";
import { getPluginApi, getLifecycleApi } from "@real-router/core/api";

import { captureSyncThrow, createTestRouter } from "../../../helpers";

import type { Router, State, RouterError } from "@real-router/core";

let router: Router;

describe("router.navigate() - events listeners", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("Issue #52: Recursive event listeners", () => {
    describe("TRANSITION_START event pollution", () => {
      it("ban eliminates redirect recursion — reentrant navigate throws, analytics fires once", async () => {
        // The #52 "recursive listener pollution" is resolved by RFC §4: a
        // synchronous redirect-via-navigate() from a TRANSITION_START listener
        // throws REENTRANT_NAVIGATION instead of re-entering the pipeline.
        const freshRouter = createTestRouter();
        const analyticsLog: string[] = [];
        let captured: unknown;

        await freshRouter.start("/home");

        // Side-effect listener (analytics) — now fires exactly once.
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            analyticsLog.push(`analytics:${toState.name}`);
          },
        );

        // Listener that attempts a sync redirect → banned.
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            if (toState.name === "admin") {
              captured = captureSyncThrow(() => freshRouter.navigate("users"));
            }
          },
        );

        const state = await freshRouter.navigate("admin");

        expect(captured).toMatchObject({
          code: errorCodes.REENTRANT_NAVIGATION,
        });
        // No recursion: the original navigation committed, analytics fired once.
        expect(state.name).toBe("admin");
        expect(analyticsLog).toStrictEqual(["analytics:admin"]);

        freshRouter.stop();
      });

      it("ban prevents redirect chains — first reentrant hop throws, no chain", async () => {
        const freshRouter = createTestRouter();
        const callLog: string[] = [];
        let captured: unknown;

        await freshRouter.start("/home");

        // Side-effect listener
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            callLog.push(`effect:${toState.name}`);
          },
        );

        // Attempted chain admin -> profile -> users: the first hop is banned.
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            if (toState.name === "admin") {
              captured = captureSyncThrow(() =>
                freshRouter.navigate("profile"),
              );
            }
          },
        );

        const state = await freshRouter.navigate("admin");

        expect(captured).toMatchObject({
          code: errorCodes.REENTRANT_NAVIGATION,
        });
        // No chain — TRANSITION_START fired once, for the original only.
        expect(state.name).toBe("admin");
        expect(callLog).toStrictEqual(["effect:admin"]);

        freshRouter.stop();
      });
    });

    describe("TRANSITION_SUCCESS event pollution", () => {
      it("should fire success listener for each completed navigation when chained", async () => {
        const freshRouter = createTestRouter();
        const successLog: string[] = [];

        await freshRouter.start("/home");

        // Side-effect listener on success
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_SUCCESS,
          (toState: State) => {
            successLog.push(`success:${toState.name}`);
          },
        );

        // Navigate and then redirect in callback
        await freshRouter.navigate("admin");
        // After admin completes, navigate to users
        await freshRouter.navigate("users");

        // Each successful navigation fires TRANSITION_SUCCESS
        // Both admin and users navigations completed successfully
        expect(successLog).toStrictEqual(["success:admin", "success:users"]);

        freshRouter.stop();
      });
    });

    describe("TRANSITION_ERROR event pollution", () => {
      it("should demonstrate error listener fires during redirect error handling", async () => {
        const freshRouter = createTestRouter();
        const errorLog: string[] = [];

        await freshRouter.start("/home");

        // Error listener
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_ERROR,
          (
            _toState: State | undefined,
            _fromState: State | undefined,
            error: RouterError,
          ) => {
            errorLog.push(`error:${error.code}`);
          },
        );

        // Guard that blocks admin
        getLifecycleApi(freshRouter).addActivateGuard(
          "admin",
          () => () => false,
        );

        try {
          await freshRouter.navigate("admin");
        } catch (error: any) {
          // Expected: navigation fails due to guard
          expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }

        // Error listener fires once for the blocked navigation
        expect(errorLog).toStrictEqual(["error:CANNOT_ACTIVATE"]);

        freshRouter.stop();
      });
    });

    describe("Multiple listeners interaction", () => {
      it("all listeners fire once for a single transition — banned redirect adds no level", async () => {
        const freshRouter = createTestRouter();
        const listener1Calls: string[] = [];
        const listener2Calls: string[] = [];
        const listener3Calls: string[] = [];
        let captured: unknown;

        await freshRouter.start("/home");

        // Listener 1: analytics
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            listener1Calls.push(toState.name);
          },
        );

        // Listener 2: UI update
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            listener2Calls.push(toState.name);
          },
        );

        // Listener 3: attempts a sync redirect → banned (RFC §4).
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            listener3Calls.push(toState.name);

            if (toState.name === "admin") {
              captured = captureSyncThrow(() => freshRouter.navigate("users"));
            }
          },
        );

        const state = await freshRouter.navigate("admin");

        expect(captured).toMatchObject({
          code: errorCodes.REENTRANT_NAVIGATION,
        });
        expect(state.name).toBe("admin");
        // No recursion level — all 3 listeners fire exactly once, for "admin".
        expect(listener1Calls).toStrictEqual(["admin"]);
        expect(listener2Calls).toStrictEqual(["admin"]);
        expect(listener3Calls).toStrictEqual(["admin"]);

        freshRouter.stop();
      });
    });

    describe("Order of execution", () => {
      it("listeners fire in registration order for a single transition (no recursion level)", async () => {
        const freshRouter = createTestRouter();
        const executionOrder: string[] = [];
        let captured: unknown;

        await freshRouter.start("/home");

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            executionOrder.push(`first:${toState.name}`);
          },
        );

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            executionOrder.push(`second:${toState.name}`);

            if (toState.name === "admin") {
              captured = captureSyncThrow(() => freshRouter.navigate("users"));
            }
          },
        );

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            executionOrder.push(`third:${toState.name}`);
          },
        );

        const state = await freshRouter.navigate("admin");

        expect(captured).toMatchObject({
          code: errorCodes.REENTRANT_NAVIGATION,
        });
        expect(state.name).toBe("admin");
        // No recursion level — all three listeners fire once, in order, for "admin".
        expect(executionOrder).toStrictEqual([
          "first:admin",
          "second:admin",
          "third:admin",
        ]);

        freshRouter.stop();
      });
    });

    describe("No redirect chain under the §4 ban", () => {
      it("first reentrant redirect throws — chain never starts", async () => {
        const freshRouter = createTestRouter();
        const redirects: string[] = [];
        let captured: unknown;

        await freshRouter.start("/home");

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            redirects.push(toState.name);

            // Attempted chain users -> orders -> profile: the first hop is banned.
            if (toState.name === "users") {
              captured = captureSyncThrow(() => freshRouter.navigate("orders"));
            }
          },
        );

        const state = await freshRouter.navigate("users");

        expect(captured).toMatchObject({
          code: errorCodes.REENTRANT_NAVIGATION,
        });
        expect(state.name).toBe("users");
        // No chain — only the original TRANSITION_START fired.
        expect(redirects).toStrictEqual(["users"]);

        freshRouter.stop();
      });
    });
  });
});
