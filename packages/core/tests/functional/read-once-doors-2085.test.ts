import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router, State } from "@real-router/core/types";

/**
 * Four doors read a caller-owned slot ONCE (#2085).
 *
 * Each of them asked a slot to decide something and asked again to use it, and
 * the second answer is the one that shipped.
 *
 * ⚑ This file owns the OUTCOMES — which route commits, which slot set a
 * comparison runs on, which `cause` is attached. The read COUNTS live in
 * `read-count-authority.test.ts`, in one table with every other door, so no
 * number is written twice.
 *
 * ⚠ A drifting fixture is what makes these outcomes observable at all. Against
 * a plain State every cell below answers identically whether the door reads
 * once or four times, which is why the counts need an owner rather than a
 * paragraph.
 */
describe("four doors read a caller-owned slot once (#2085)", () => {
  /** A State whose `name` answers `base.name` for `n` reads, then `second`. */
  const driftingName = (
    base: State,
    n: number,
    second: string,
  ): { state: State; reads: () => number } => {
    let reads = 0;
    const s: Record<string, unknown> = {
      params: base.params,
      search: base.search,
      path: base.path,
      context: {},
    };

    Object.defineProperty(s, "name", {
      enumerable: true,
      get(): string {
        reads += 1;

        return reads <= n ? base.name : second;
      },
    });

    return { state: s as unknown as State, reads: () => reads };
  };

  describe("navigateToState — the name that COMMITS is the name that was validated", () => {
    const mk = async (): Promise<Router> => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "users", path: "/u/:id" },
        { name: "admin", path: "/a/:section" },
      ]);

      await router.start("/home");

      return router;
    };

    /** `reads · what the router committed`. */
    const observe = async (n: number, second: string): Promise<string> => {
      const router = await mk();
      const target = getPluginApi(router).makeState("users", { id: "7" });
      const d = driftingName(target, n, second);

      let answer: string;

      try {
        await getInternals(router).navigateToState(d.state);

        const committed = router.getState();

        answer = `name=${committed?.name} path=${committed?.path}`;
      } catch (error) {
        // A drift that lands ON the existence check is refused rather than
        // committed — the door reaching its own guard, and the control that the
        // instrument is wired to something.
        answer = `REJECTED ${(error as { code?: string }).code}`;
      }

      router.dispose();

      return answer;
    };

    it("commits what the FIRST read named, whatever the later ones say", async () => {
      // ⚑ The door reads the name to test it against UNKNOWN_ROUTE, to ask
      // `hasRoute`, to ask `getQueryParams` for the P3 channel registry, and
      // once more in `#copyChannels` — and only that last one reaches
      // `getState()`. A drift between them committed a state whose `name` was
      // never checked for existence and whose `path` belongs to another route.
      const table = {
        "drift after 1 read": await observe(1, "admin"),
        "drift after 2 reads": await observe(2, "admin"),
        "drift to a route that does NOT exist": await observe(1, "nope"),
        "CONTROL — a stable accessor": await observe(999, "admin"),
      };

      expect(table).toStrictEqual({
        "drift after 1 read": "name=users path=/u/7",
        "drift after 2 reads": "name=users path=/u/7",
        "drift to a route that does NOT exist": "name=users path=/u/7",
        "CONTROL — a stable accessor": "name=users path=/u/7",
      });
    });
  });

  describe("areStatesEqual — the name that picks the slot set is the name that was compared", () => {
    const mk = (): Router =>
      createRouter([
        { name: "users", path: "/u/:id" },
        { name: "admin", path: "/a/:section" },
      ]);

    it("compares the slots of the route the FIRST read named", () => {
      const router = mk();
      const api = getPluginApi(router);
      const a = api.makeState("users", { id: "1" });
      const b = api.makeState("users", { id: "2" });

      const drift = driftingName(a, 1, "admin");
      const stable = driftingName(a, 999, "admin");

      const table = {
        // `id` differs, so every cell must answer `false`. A second read naming
        // `admin` selected ITS slots (`section`), which neither state carries —
        // leaving nothing to differ on.
        "CONTROL — plain states": router.areStatesEqual(a, b),
        "CONTROL — stable accessor": router.areStatesEqual(stable.state, b),
        "drift users -> admin": router.areStatesEqual(drift.state, b),
      };

      router.dispose();

      expect(table).toStrictEqual({
        "CONTROL — plain states": false,
        "CONTROL — stable accessor": false,
        "drift users -> admin": false,
      });
    });
  });

  describe("wrapSyncError — the cause that is attached is the cause that was tested", () => {
    it("attaches what the test read, not a later answer", async () => {
      const router = createRouter([
        { name: "home", path: "/home" },
        { name: "guarded", path: "/g" },
      ]);

      await router.start("/home");

      let reads = 0;
      const thrown = new Error("boom");

      Object.defineProperty(thrown, "cause", {
        configurable: true,
        get(): unknown {
          reads += 1;

          return reads <= 1 ? "FIRST" : "SECOND";
        },
      });

      getLifecycleApi(router).addActivateGuard("guarded", () => () => {
        throw thrown;
      });

      let attached: unknown;

      try {
        await router.navigate("guarded");
      } catch (error) {
        attached = (error as { cause?: unknown }).cause;
      }

      router.dispose();

      expect(attached).toBe("FIRST");
    });
  });

  describe("areParamValuesEqual — one length decides the test AND the walk", () => {
    it("uses the length the comparison was made on", () => {
      const router = createRouter([{ name: "s", path: "/s?a" }]);

      let reads = 0;
      // ⚠ `Array.isArray` answers TRUE through a Proxy, and a reactive array
      // (Vue `reactive([])`) is exactly that shape — so this passes the guard
      // above the reads.
      const proxied = new Proxy(["x", "y"], {
        get(target, key, receiver) {
          if (key === "length") {
            reads += 1;

            // Equal to the comparand on the FIRST read, empty afterwards — so a
            // later read skips the element walk entirely.
            return reads <= 1 ? 2 : 0;
          }

          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      const mkState = (a: string[]): State =>
        ({
          name: "s",
          params: {},
          search: { a },
          path: "/s",
          context: {},
        }) as unknown as State;

      const table = {
        // The two arrays differ in their SECOND element, so every cell is `false`.
        "CONTROL — plain arrays": router.areStatesEqual(
          mkState(["x", "y"]),
          mkState(["x", "z"]),
          false,
        ),
        "drifting length": router.areStatesEqual(
          mkState(proxied),
          mkState(["x", "z"]),
          false,
        ),
      };

      router.dispose();

      expect(table).toStrictEqual({
        "CONTROL — plain arrays": false,
        "drifting length": false,
      });
    });
  });
});
