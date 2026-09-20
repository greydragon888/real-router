import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

/**
 * A refusal names the door the caller typed (#2399).
 *
 * `packages/validation-plugin/README.md` promises `[router.METHOD]` on every
 * message from this plugin, and core derives the same rule for its own package
 * in `message-prefix-authority-1845.test.ts`. This package has no counterpart,
 * which is how a check whose message names `addRoute` came to run at the
 * `update` door only: the message was right about the defect and wrong about the
 * door, so a reader grepping their own code for `addRoute` found nothing.
 *
 * ⚑ **A cell pins the prefix AND what the message says**, because the prefix
 * alone does not discriminate: every refusal of one door carries it, so a cell
 * whose trigger stops reaching its own check keeps passing on the door's next
 * refusal. `says` is what makes the cell measure the refusal it names.
 *
 * ⚑ Two spellings are registered rather than treated as defects, each recorded
 * where it was decided:
 * - **both batch doors report `addRoute`** — `packages/core/src/guards.ts` states
 *   that name for every batch door deliberately, so `add` and `replace` surface
 *   one name;
 * - **the retrospective pass reports `[validation-plugin]`** — no public method
 *   was called, and `README.md` documents that spelling.
 *
 * ⚠ `Circular forwardTo: …` carries NO prefix, and its cell registers that:
 * core raises it from `forwardChain.ts` on the map this plugin hands it with the
 * pending edge spliced in, so the wording and the missing prefix are core's.
 * Registering it says who owns the message — the same cross-package reading
 * `bare-core-message-parity.test.ts` already does here — and it keeps
 * `prefixOf`'s no-prefix answer load-bearing.
 */

const prefixOf = (error: unknown): string =>
  (/^\[[^\]]+]/.exec((error as Error).message) ?? ["<no prefix>"])[0];

const freshRouter = (): Router => {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "plain", path: "/plain" },
    { name: "needsId", path: "/needs/:id" },
  ]);

  router.usePlugin(validationPlugin());

  return router;
};

interface Cell {
  /** The facade door the caller typed. */
  readonly door: string;
  readonly what: string;
  /** What the message must say past its prefix — the cell's discriminator. */
  readonly says: RegExp;
  /** Prefix this refusal carries, when it is not `[router.<door>]`. */
  readonly registered?: string;
  readonly trigger: (routes: RoutesApi, router: Router) => void | Promise<void>;
}

const CELLS: readonly Cell[] = [
  {
    door: "addRoute",
    what: "forwardTo target does not exist",
    says: /forwardTo target "ghost" does not exist/,
    trigger: (routes) => {
      routes.add([{ name: "x", path: "/x", forwardTo: "ghost" }]);
    },
  },
  {
    door: "addRoute",
    what: "forwardTo target needs a param the source lacks",
    says: /requires params \[id\] that are not available in source route "x"/,
    trigger: (routes) => {
      routes.add([{ name: "x", path: "/x", forwardTo: "needsId" }]);
    },
  },
  {
    door: "addRoute",
    what: "parent option names no route",
    says: /Parent route "ghost" does not exist/,
    trigger: (routes) => {
      routes.add([{ name: "x", path: "/x" }], { parent: "ghost" });
    },
  },
  {
    door: "replaceRoutes",
    what: "forwardTo target does not exist",
    says: /forwardTo target "ghost" does not exist/,
    registered: "[router.addRoute]",
    trigger: (routes) => {
      routes.replace([{ name: "x", path: "/x", forwardTo: "ghost" }]);
    },
  },
  {
    door: "replaceRoutes",
    what: "forwardTo target needs a param the source lacks",
    says: /requires params \[id\] that are not available in source route "x"/,
    registered: "[router.addRoute]",
    trigger: (routes) => {
      routes.replace([
        { name: "x", path: "/x", forwardTo: "y" },
        { name: "y", path: "/y/:id" },
      ]);
    },
  },
  {
    door: "updateRoute",
    what: "forwardTo target does not exist",
    says: /forwardTo target "ghost" does not exist/,
    trigger: (routes) => {
      routes.update("plain", { forwardTo: "ghost" });
    },
  },
  {
    door: "updateRoute",
    what: "forwardTo target needs a param the source lacks",
    says: /requires params \[id\] that are not available in source route "plain"/,
    trigger: (routes) => {
      routes.update("plain", { forwardTo: "needsId" });
    },
  },
  {
    door: "updateRoute",
    what: "the forwardTo closes a cycle — core's message, core's prefix rule",
    says: /Circular forwardTo: home → plain → home/,
    registered: "<no prefix>",
    trigger: (routes) => {
      routes.update("plain", { forwardTo: "home" });
      routes.update("home", { forwardTo: "plain" });
    },
  },
  {
    door: "updateRoute",
    what: "the patch is not an object",
    says: /updates must be an object, got number/,
    trigger: (routes) => {
      (routes as unknown as { update: (n: string, u: unknown) => void }).update(
        "plain",
        42,
      );
    },
  },
  {
    door: "removeRoute",
    what: "the name is not a string",
    says: /Route name must be a string, got number/,
    trigger: (routes) => {
      (routes as unknown as { remove: (n: unknown) => void }).remove(42);
    },
  },
  {
    door: "hasRoute",
    what: "the name is not a string",
    says: /Route name must be a string, got number/,
    trigger: (routes) => {
      (routes as unknown as { has: (n: unknown) => void }).has(42);
    },
  },
  {
    door: "getRoute",
    what: "the name is not a string",
    says: /Route name must be a string, got number/,
    trigger: (routes) => {
      (routes as unknown as { get: (n: unknown) => void }).get(42);
    },
  },
  {
    door: "clear",
    what: "a state is committed — core's own guard, and the only door whose refusal is about the router rather than the call",
    says: /Cannot clear routes while a state is committed/,
    trigger: async (routes, router) => {
      await router.start("/home");
      routes.clear();
    },
  },
  {
    door: "subscribeChanges",
    what: "the handler is not a function — core's own always-on guard",
    says: /Expected a function/,
    trigger: (routes) => {
      (
        routes as unknown as { subscribeChanges: (h: unknown) => void }
      ).subscribeChanges(42);
    },
  },
];

/** Which facade door each `RoutesApi` key is, for the completeness check. */
const DOOR_BY_KEY: Readonly<Record<string, string>> = {
  add: "addRoute",
  remove: "removeRoute",
  update: "updateRoute",
  clear: "clear",
  has: "hasRoute",
  get: "getRoute",
  replace: "replaceRoutes",
  subscribeChanges: "subscribeChanges",
};

describe("a route-CRUD refusal names the door the caller typed (#2399)", () => {
  it.each(CELLS)(
    "$door — $what",
    async ({ door, says, registered, trigger }) => {
      const router = freshRouter();

      let thrown: unknown;

      try {
        await trigger(getRoutesApi(router), router);
      } catch (error) {
        thrown = error;
      }

      // Anti-vacuum: a cell that stops refusing measures nothing.
      expect(thrown).toBeInstanceOf(Error);
      // The discriminator: this is the refusal the cell names, not the door's
      // next one — every refusal of a door carries the same prefix.
      expect((thrown as Error).message).toMatch(says);
      expect(prefixOf(thrown)).toBe(registered ?? `[router.${door}]`);

      router.stop();
    },
  );

  it("covers every door the LIVE `RoutesApi` surface hands out", () => {
    // Derived, not listed: the set comes off the surface itself, so a door added
    // to `getRoutesApi` fails here until it has a cell.
    const covered = new Set(CELLS.map((cell) => cell.door));
    const surface = Object.keys(getRoutesApi(freshRouter()));
    const unwatched = surface.filter(
      (key) => !(key in DOOR_BY_KEY && covered.has(DOOR_BY_KEY[key])),
    );

    expect(unwatched).toStrictEqual([]);
    // Anti-vacuum on the DERIVED side: a surface that hands out nothing, or a
    // non-enumerable one, would satisfy the line above with zero measured.
    expect(surface.length).toBeGreaterThanOrEqual(8);
  });
});
