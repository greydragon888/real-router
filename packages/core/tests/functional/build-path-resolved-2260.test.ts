import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Params, Route, Router, SearchParams } from "@real-router/core";

/**
 * `PluginApi.buildPathResolved` — print a path for an intent the caller has
 * ALREADY resolved, without running the `forwardState` chain again (#2260).
 *
 * ⚑ **It exists because the href door needs the printer WITHOUT the seam, and
 * nothing else on the public surface is one.** `router.buildPath` runs the
 * chain a door lower (#2087), which is correct for a caller holding a raw
 * intent and a second pass for one holding a resolved one. The only existing
 * seam-free printer is `PluginApi.makeState`, which prints by building and
 * discarding a whole `State`: measured, +236 ns per call against this door, and
 * +17 % on the arm for the 84 % of applications that install no seam plugin at
 * all.
 *
 * ⚠ **The terminal is `RoutesNamespace.buildPathFromIntent`, reached through
 * `RouterInternals`, and that indirection is the point rather than ceremony.**
 * Spelling `buildURL(canonicalize(…, { resolveForward: false }), …)` here
 * instead would be a SECOND copy of that rule, and `src/channels/CLAUDE.md`
 * names the class with its incident (#1584): a sweep of `canonicalize`'s port
 * consumers cannot see a method that reads its own dependency bag, so the
 * second copy is invisible to exactly the audits that maintain the first.
 *
 * ⚠ **`port.buildPath` is NOT this door's terminal, and the difference is
 * silent.** That one prints raw, below the default merge — a route's
 * `defaultParams` / `defaultSearch` would vanish from every href, with no
 * error anywhere. The `defaults` cells below are what makes that substitution
 * red instead of shipped.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "plain", path: "/plain?q" },
  { name: "params", path: "/p/:id?q" },
  { name: "splat", path: "/s/*rest?q" },
  { name: "defaults", path: "/d?q&page", defaultSearch: { page: "1" } },
  { name: "dfltp", path: "/dp/:id", defaultParams: { id: "42" } },
  { name: "coerce", path: "/c?n" },
  { name: "enc", path: "/e/:seg" },
  {
    name: "nested",
    path: "/n",
    children: [{ name: "leaf", path: "/leaf?q" }],
  },
  { name: "trail", path: "/t/" },
];

/**
 * Every shape the two printers could disagree on: both channels, both kinds of
 * default, a splat, nesting, a trailing slash, and a segment carrying every
 * character the encoder handles.
 */
const SHAPES: readonly [string, Params, SearchParams | undefined][] = [
  ["plain", {}, { q: "x" }],
  ["plain", {}, undefined],
  ["params", { id: "7" }, { q: "x" }],
  ["splat", { rest: "a/b/c" }, { q: "x" }],
  ["defaults", {}, { q: "x" }],
  ["dfltp", {}, undefined],
  ["coerce", {}, { n: "5" }],
  ["enc", { seg: "a b/c?d#e" }, undefined],
  ["nested.leaf", {}, { q: "x" }],
  ["trail", {}, undefined],
  ["home", {}, undefined],
];

/** Names no route table holds, and bags no route can print from. */
const REFUSALS: readonly [string, string, Params][] = [
  ["an unknown name", "nope", {}],
  ["a missing path param", "params", {}],
  ["a missing splat", "splat", {}],
  ["a null param value", "params", { id: null }],
  ["an empty-string param", "params", { id: "" }],
];

async function started(): Promise<Router> {
  const router = createRouter([...ROUTES]);

  await router.start("/");

  return router;
}

/** What a call answered, or the message it refused with. */
function outcome(run: () => string): string {
  try {
    return `= ${run()}`;
  } catch (error) {
    return `! ${(error as Error).message}`;
  }
}

describe("PluginApi.buildPathResolved (#2260)", () => {
  it("prints exactly what router.buildPath prints, on every shape", async () => {
    const router = await started();
    const api = getPluginApi(router);

    const table = SHAPES.map(([name, params, search]) => [
      name,
      outcome(() => router.buildPath(name, params, search)),
      outcome(() => api.buildPathResolved(name, params, search)),
    ]);

    for (const [name, viaFacade, viaDoor] of table) {
      expect(viaDoor, `${name} — the two printers agree`).toBe(viaFacade);
    }

    // The agreement above is satisfiable by two printers that both refuse
    // everything, so the shapes are pinned to have actually PRINTED.
    expect(table.every(([, viaFacade]) => viaFacade.startsWith("="))).toBe(
      true,
    );

    router.stop();
  });

  it("merges the route's defaults — both channels", async () => {
    const router = await started();
    const api = getPluginApi(router);

    // `port.buildPath`, the other seam-free printer in core, prints below this
    // merge. Substituting it passes every cell above and reds exactly here.
    expect(api.buildPathResolved("defaults", {}, { q: "x" })).toBe(
      "/d?q=x&page=1",
    );
    expect(api.buildPathResolved("dfltp", {}, undefined)).toBe("/dp/42");

    router.stop();
  });

  it("refuses what router.buildPath refuses, with the same message", async () => {
    const router = await started();
    const api = getPluginApi(router);

    for (const [label, name, params] of REFUSALS) {
      const viaFacade = outcome(() => router.buildPath(name, params, {}));
      const viaDoor = outcome(() => api.buildPathResolved(name, params, {}));

      expect(viaFacade, `${label} — the facade refuses it`).toMatch(/^!/);
      expect(viaDoor, `${label} — and so does the door, identically`).toBe(
        viaFacade,
      );
    }

    router.stop();
  });

  it("runs the forwardState chain ZERO times", async () => {
    const router = await started();
    const api = getPluginApi(router);
    let passes = 0;

    const remove = api.addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        passes += 1;

        return next(name, params, search);
      },
    );

    api.buildPathResolved("plain", {}, { q: "x" });

    expect(passes, "the caller already resolved; this door prints").toBe(0);

    // CONTROL — the same counter over the facade, which DOES run the chain.
    // Without it the zero above is equally true of an interceptor that was
    // never registered.
    router.buildPath("plain", {}, { q: "x" });

    expect(passes, "the instrument is live").toBe(1);

    remove();
    router.stop();
  });

  it("takes an OMITTED params bag, like router.buildPath does", async () => {
    // Not a shape cell: the table above always hands a bag, so the `??` that
    // turns an absent one into the shared frozen singleton is a branch no cell
    // above reaches. A route with a path slot is the discriminating case —
    // without the fallback the printer would be handed `undefined` and throw
    // something other than the missing-param error.
    const router = await started();
    const api = getPluginApi(router);

    expect(api.buildPathResolved("home")).toBe("/");
    expect(api.buildPathResolved("dfltp")).toBe("/dp/42");
    expect(() => api.buildPathResolved("params")).toThrow(
      /Missing required param 'id'/,
    );

    router.stop();
  });

  it("does not resolve forwardTo — it is the printer, not the resolver", async () => {
    // The caller resolves, through `forwardState`. A door that ALSO resolved
    // would make the href correct by a second mechanism and hide a regression
    // in the first.
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "old", path: "/old/:id", forwardTo: "fresh" },
      { name: "fresh", path: "/fresh/:id" },
    ]);

    await router.start("/");

    expect(getPluginApi(router).buildPathResolved("old", { id: "1" })).toBe(
      "/old/1",
    );

    router.stop();
  });
});
