// A factory surface that is SHARED between consumers is frozen.
//
// The six factories split on two axes, and the defect lived in exactly
// one quadrant (#1805): a surface that is both CACHED per router and carries
// MUTATING members is where a hijack is worth the most, because replacing a
// member there rewires every later consumer of that router — 19 packages for
// `getPluginApi`, and `getRoutesApi`'s three plugins plus 100 call sites across
// the example apps.
//
// The two controls at the ends are what make this sharp rather than a blanket
// "freeze everything": `getNavigator` is cached AND frozen and documents itself
// as *"a frozen read-only subset"*; `getLifecycleApi` and `getDependenciesApi`
// are unfrozen but built fresh per call, so a write cannot reach a second
// consumer at all.
//
// ⚠ The `cached` column is MEASURED here, not declared. It is the premise the
// freeze requirement rests on — "shared, therefore must be frozen" — and a
// factory that quietly starts or stops caching would otherwise change what this
// guard demands without any cell moving.
//
// ⚠ `OPEN` is a BACKLOG, not an approval, and it is a RATCHET in both
// directions. Fixing `getPluginApi` empties it and reds the cell, so the author
// deletes the row; a NEW cached-and-unfrozen factory grows it and reds the cell
// too. A `toBeLessThanOrEqual` would develop slack with the first fix, which is
// the failure mode `table-vacuity-authority` records one file over.
//
// The remaining row is not an oversight: freezing `getPluginApi` costs 20 tests
// across `sources`, `browser-plugin`, `hash-plugin` and `navigation-plugin`,
// all of which spy on the shared surface to inject errors — and
// `getPluginApi.ts`'s own docblock advertises that use. It needs a migration and
// a docblock correction, not a one-line freeze. Measured in #1805.

import { describe, expect, it } from "vitest";

import { createRouter, getNavigator } from "@real-router/core";
import {
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";

const ROUTES = [{ name: "a", path: "/a" }];

/** One member of each surface, used only as a write target. */
const FACTORIES = [
  { get: getNavigator, member: "navigate", name: "getNavigator" },
  { get: getRoutesApi, member: "add", name: "getRoutesApi" },
  { get: getPluginApi, member: "addInterceptor", name: "getPluginApi" },
  { get: getLifecycleApi, member: "addActivateGuard", name: "getLifecycleApi" },
  { get: getDependenciesApi, member: "set", name: "getDependenciesApi" },
  { get: getInternals, member: "port", name: "getInternals" },
] as const;

/**
 * Cached AND still unfrozen because it is a DEFECT awaiting a fix. A backlog,
 * not an approval: delete rows, never add them.
 *
 * ⚑ EMPTY, and that is the state to keep it in. A cached surface belongs in
 * `LIVE_BY_CONTRACT` with a written reason, or it is frozen — there is no third
 * answer, and this set exists so that a fourth one has to be argued for in a
 * diff rather than assumed.
 */
const OPEN = new Set<string>();

/**
 * Cached and unfrozen because that IS the contract — a different thing from
 * `OPEN`, and conflating the two would either excuse a defect or demand a fix
 * that breaks a shipped package.
 *
 * `getInternals` hands back the live internals bag on the published
 * `/validation` subpath, and two of its fields are declared WITHOUT `readonly`
 * on purpose: `hydrationState` is a one-shot scratchpad that
 * `ssr-utils/hydrateRouter.ts:85` fills and clears at `:90`, and `validator` is
 * installed by the validation plugin. Freezing this surface would break SSR
 * hydration. The cell below pins the write rather than merely excusing it.
 */
const LIVE_BY_CONTRACT = new Set(["getInternals"]);

type Surface = Record<string, unknown>;

/**
 * ⚠ Through `unknown`, because the five factories have genuinely different
 * return types and the union of their signatures does not overlap with a
 * uniform one (TS2352). Treating them uniformly is the point of this table —
 * every row is asked the same two questions about the object it hands back —
 * so the cast is where that uniformity is paid for, once.
 */
const surfaceOf = (
  factory: (typeof FACTORIES)[number],
  router: Router,
): Surface => (factory.get as unknown as (r: Router) => Surface)(router);

function measure(factory: (typeof FACTORIES)[number]): {
  cached: boolean;
  frozen: boolean;
} {
  const router = createRouter(ROUTES);
  const first = surfaceOf(factory, router);

  return {
    cached: surfaceOf(factory, router) === first,
    frozen: Object.isFrozen(first),
  };
}

describe("factory surface freeze authority (#1805)", () => {
  it("covers every router-keyed factory the package exports", () => {
    // Counted outside the `each` blocks below: an empty table registers no
    // cells and still exits green (`table-vacuity-authority`).
    expect(FACTORIES).toHaveLength(6);
  });

  it.each(FACTORIES)(
    "$name: a surface is frozen exactly when it is shared",
    (factory) => {
      const { cached, frozen } = measure(factory);

      const exempt =
        OPEN.has(factory.name) || LIVE_BY_CONTRACT.has(factory.name);

      expect(frozen).toBe(cached && !exempt);
    },
  );

  it("the shared-but-unfrozen surfaces are exactly the two recorded sets", () => {
    const unfrozen = FACTORIES.filter((factory) => {
      const { cached, frozen } = measure(factory);

      return cached && !frozen;
    }).map(({ name }) => name);

    expect(unfrozen).toStrictEqual([...OPEN, ...LIVE_BY_CONTRACT]);
  });

  it("getInternals stays writable, which is why it is exempt", () => {
    // The carve-out, pinned rather than asserted in prose: freezing this
    // surface would break `hydrateRouter`, which writes `hydrationState` and
    // clears it in a `finally`.
    const ctx = getInternals(createRouter(ROUTES)) as unknown as Surface;
    const previous = ctx.hydrationState;

    ctx.hydrationState = { marker: true };

    expect(getInternals(createRouter(ROUTES))).toBeDefined();
    expect(ctx.hydrationState).toStrictEqual({ marker: true });

    ctx.hydrationState = previous;
  });

  it.each(
    FACTORIES.filter(
      ({ name }) => !OPEN.has(name) && !LIVE_BY_CONTRACT.has(name),
    ),
  )("$name: a write cannot reach a second consumer", (factory) => {
    const router = createRouter(ROUTES);
    const first = surfaceOf(factory, router);
    const sentinel = (): string => "PATCHED";

    try {
      first[factory.member] = sentinel;
    } catch {
      // A frozen surface refuses in strict mode; an uncached one accepts the
      // write harmlessly. Both are asked the same question below.
    }

    // ⚠ Asked as "did MY write arrive", not "is the member the one I first
    // saw". An uncached factory builds fresh closures per call, so identity
    // with the first read is false for `getLifecycleApi` and
    // `getDependenciesApi` by construction — and asserting it made both
    // controls fail for a reason that has nothing to do with poisoning.
    expect(surfaceOf(factory, router)[factory.member]).not.toBe(sentinel);
  });
});
