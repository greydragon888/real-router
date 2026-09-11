import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src";

import type { Route, Router } from "@real-router/core";

/**
 * `RouterInternals` promises what its guarded sibling promises (#2259) — proved
 * per door instead of asserted in prose.
 *
 * ⚑ **The pair set is DERIVED from the live objects, never listed.** A list read
 * off the source was wrong twice while #2259 was decided: too wide from reading
 * which guards appear in the facade's body, too narrow from trying one input per
 * door. `Reflect.ownKeys` on the two surfaces cannot drift from them.
 *
 * ⚠ **Three outcomes, and only the first is a defect.** A pair may BYPASS (the
 * guarded side refuses, the internal side accepts), be a PLAIN ALIAS (one
 * function reached two ways — `api.getOptions === ctx.getOptions`, so nothing can
 * diverge), or differ only in failure SHAPE (a synchronous throw against an
 * asynchronous rejection, the asymmetry `internals.ts` records for
 * `navigateToState`). A census that collapses them reports the last two as work.
 *
 * ⚠ **Both arms, because the gap WIDENS with the plugin.** Most facade guards are
 * `ctx.validator?.…`, so a single-arm run finds less than half of what a plugin
 * user meets.
 *
 * ⚠ **The input is derived no further than this.** Finding the pair is mechanical;
 * finding the value that separates it is not, so the vectors below are declared —
 * and the ratchet cell fails when a door has none, which is how a new door on the
 * weaker side gets noticed instead of inherited.
 */
const ROUTES: readonly Route[] = [
  { name: "u", path: "/u/:id?q" },
  { name: "p", path: "/p" },
];

/** Hostile values that have actually separated a pair, each for a stated reason. */
/**
 * ⚠ A BOXED primitive, and the wrapper is the point: `typeof` says `"object"`
 * while the value is usable, which is what separates a guard written as
 * `typeof x === "string"` from one written as `isString`. `String(v)` would
 * defeat the vector entirely.
 */
const boxed = (v: string): never =>
  // eslint-disable-next-line sonarjs/no-primitive-wrappers, unicorn/new-for-builtins -- the wrapper IS the probe
  new String(v) as unknown as never;
/** An accessor bag whose declared query slot answers differently per read (#2249). */
const drifting = (): never => {
  let n = 0;

  return {
    id: "7",
    get q() {
      n += 1;

      return n >= 2 ? "LATE" : undefined;
    },
  } as unknown as never;
};

interface Vector {
  readonly input: string;
  /**
   * Arguments for the GUARDED door, as a FACTORY.
   *
   * ⚠ Not a fixed array: a vector whose bag carries an accessor is spent by the
   * first door that reads it, so a shared object makes the second door see a
   * settled value and the cell reports `same` for a pair that diverges. Caught
   * here — the drifting-bag row read `same` until the arguments were minted per
   * call.
   */
  readonly pub: () => readonly unknown[];
  /** Arguments for the INTERNAL door, which may take an extra slot. */
  readonly int?: (ctx: Record<string, never>) => readonly unknown[];
  /** The door mutates router state, so the cell needs its own instance. */
  readonly fresh?: boolean;
  /**
   * The door is `start`, so the instance must NOT be started yet — on a started
   * router both sides refuse for a reason that has nothing to do with the
   * argument, and the cell would be vacuous.
   */
  readonly unstarted?: boolean;
}

/**
 * One entry per DISTINCT pair. Plain aliases are absent on purpose — there is
 * nothing to separate when both names reach one function.
 */
const VECTORS: Readonly<Record<string, readonly Vector[]>> = {
  addEventListener: [
    { input: "bad event name", pub: () => ["nope", () => undefined] },
    { input: "non-function listener", pub: () => ["transitionSuccess", 42] },
  ],
  emitTransitionError: [{ input: "non-error value", pub: () => [42] }],
  forwardState: [
    { input: "junk search channel", pub: () => ["u", { id: "7" }, 42] },
    { input: "boxed route name", pub: () => [boxed("u"), { id: "7" }] },
  ],
  makeState: [
    {
      input: "mis-channelled key",
      pub: () => ["u", { id: "7", q: "x" }, {}, "/u/7"],
    },
    { input: "drifting bag", pub: () => ["u", drifting(), {}, "/u/7"] },
    {
      input: "boxed route name",
      pub: () => [boxed("u"), { id: "7" }, {}, "/u/7"],
    },
  ],
  matchPath: [
    {
      input: "non-string path",
      pub: () => [42],
      int: (ctx) => [42, (ctx.getOptions as unknown as () => unknown)()],
    },
    {
      input: "boxed path",
      pub: () => [boxed("/u/7")],
      int: (ctx) => [
        boxed("/u/7"),
        (ctx.getOptions as unknown as () => unknown)(),
      ],
    },
  ],
  navigateToState: [
    {
      input: "non-boolean options flag",
      pub: () => [
        { name: "u", params: { id: "7" }, search: {}, path: "/u/7" },
        { reload: "yes" },
      ],
      fresh: true,
    },
    {
      input: "state.name is an object",
      pub: () => [{ name: { evil: true }, params: {}, search: {}, path: "/p" }],
      fresh: true,
    },
  ],
  setRootPath: [
    { input: "non-string", pub: () => [42], fresh: true },
    { input: "boxed string", pub: () => [boxed("/base")], fresh: true },
  ],
  navigateToNotFound: [
    { input: "non-string", pub: () => [42], fresh: true },
    { input: "boxed string", pub: () => [boxed("/zz")], fresh: true },
    { input: "omitted argument", pub: () => [], fresh: true },
  ],
  start: [
    { input: "non-string", pub: () => [42], unstarted: true },
    { input: "boxed string", pub: () => [boxed("/p")], unstarted: true },
  ],
};

type Outcome = "returned" | "resolved" | "THREW" | "REJECTED";

const settle = async (call: () => unknown): Promise<Outcome> => {
  try {
    const value = call();

    if (typeof (value as { then?: unknown } | undefined)?.then === "function") {
      try {
        await value;

        return "resolved";
      } catch {
        return "REJECTED";
      }
    }

    return "returned";
  } catch {
    return "THREW";
  }
};

const accepted = (o: Outcome): boolean => o === "returned" || o === "resolved";

/** BYPASS is the only defect: the guarded side refused and the internal one did not. */
const verdict = (pub: Outcome, int: Outcome): string => {
  if (accepted(pub) !== accepted(int)) {
    return accepted(int) ? "BYPASS" : "internal-stricter";
  }

  // Both refused, or both accepted — `shape` is the sync-throw / async-reject
  // asymmetry, which is not a defect by default.
  return pub === int ? "same" : "shape";
};

const build = async (withPlugin: boolean, started = true): Promise<Router> => {
  const router = createRouter([...ROUTES]);

  if (withPlugin) {
    router.usePlugin(validationPlugin());
  }

  if (started) {
    await router.start("/p");
  }

  return router;
};

/**
 * Both surfaces of one router, as bags the probe can index by name.
 *
 * ⚠ **The guarded side is `PluginApi` OR the router itself.** Deriving against
 * `PluginApi` alone under-counts: `navigateToNotFound` and `start` sit on the
 * public `Router` and have an internals twin, and a census blind to them reports
 * a smaller scope than the one that exists.
 */
const surfaces = (
  router: Router,
): { pub: Record<string, never>; int: Record<string, never> } => {
  const api = getPluginApi(router) as unknown as Record<string, never>;
  const facade = router as unknown as Record<string, never>;

  return {
    // `PluginApi` wins a collision: it is the door a plugin author is handed.
    pub: new Proxy(api, {
      get: (target, key) =>
        key in target ? target[key as string] : facade[key as string],
      has: (target, key) => key in target || key in facade,
    }),
    int: getInternals(router) as unknown as Record<string, never>,
  };
};

const sharedPairs = (router: Router): string[] => {
  const api = getPluginApi(router) as object;
  const int = getInternals(router) as object;
  const own = (o: object): string[] =>
    Reflect.ownKeys(o).filter((k): k is string => typeof k === "string");
  const guarded = new Set(own(api));

  // The router's own callable surface, prototype methods included — they are
  // what an application reaches, so a twin of one is a pair.
  for (const key of own(router)) {
    if (
      typeof (router as unknown as Record<string, unknown>)[key] === "function"
    ) {
      guarded.add(key);
    }
  }

  for (const key of Object.getOwnPropertyNames(
    Object.getPrototypeOf(router) as object,
  )) {
    if (
      key !== "constructor" &&
      typeof (router as unknown as Record<string, unknown>)[key] === "function"
    ) {
      guarded.add(key);
    }
  }

  return own(int)
    .filter((k) => guarded.has(k))
    .toSorted((a, b) => a.localeCompare(b));
};

/** One function reached by two names: `api.getOptions === ctx.getOptions`. */
const plainAliases = (router: Router): string[] => {
  const { pub, int } = surfaces(router);

  return sharedPairs(router).filter((k) => pub[k] === int[k]);
};

describe("an internal door answers what its guarded sibling answers (#2258 / #2259)", () => {
  it("derives the pair set from the live surfaces, and it is not empty", async () => {
    // POSITIVE control for every cell below: an empty derivation is also what a
    // renamed export or a frozen-surface change would produce.
    const router = await build(false);

    expect(sharedPairs(router).length).toBeGreaterThan(5);

    router.stop();
  });

  it("classifies the plain aliases by IDENTITY, not by name", async () => {
    // ⚠ These are one function, so no input can separate them and asserting
    // agreement on them would be vacuous. Identity is what says so.
    const router = await build(false);

    expect(plainAliases(router)).toStrictEqual([
      "getOptions",
      "getRootPath",
      "getTree",
    ]);

    router.stop();
  });

  it("has a probe vector for every DISTINCT pair — the ratchet", async () => {
    // A door added to `RouterInternals` beside a guarded sibling is unprobed
    // until it appears here. Inheriting the weaker side silently is how the
    // #2243–#2256 wave was generated.
    const router = await build(false);
    const aliases = new Set(plainAliases(router));
    const distinct = sharedPairs(router).filter((k) => !aliases.has(k));

    expect(distinct.filter((k) => !(k in VECTORS))).toStrictEqual([]);
    expect(
      Object.keys(VECTORS).filter((k) => !distinct.includes(k)),
    ).toStrictEqual([]);

    router.stop();
  });

  it.each([
    { withPlugin: false, arm: "in bare core" },
    { withPlugin: true, arm: "with the validation plugin" },
  ])("reports the same verdicts $arm", async ({ withPlugin }) => {
    const seen: string[] = [];
    let router = await build(withPlugin);

    for (const [door, vectors] of Object.entries(VECTORS)) {
      for (const vector of vectors) {
        if (vector.fresh) {
          router.stop();
          router = await build(withPlugin);
        }

        const { pub, int } = surfaces(router);
        const intArgs = vector.int ? vector.int(int) : vector.pub();
        const pubOutcome = await settle(() =>
          (pub[door] as unknown as (...a: unknown[]) => unknown)(
            ...vector.pub(),
          ),
        );
        const intOutcome = await settle(() =>
          (int[door] as unknown as (...a: unknown[]) => unknown)(...intArgs),
        );

        seen.push(
          `${door} · ${vector.input} → ${verdict(pubOutcome, intOutcome)}`,
        );
      }
    }

    router.stop();

    // Joined, not array-compared: vitest elides a 14-element array diff and
    // prints a string one in full, which is the whole value of the ledger.
    expect(seen.join("\n")).toBe(
      (withPlugin ? BASELINE_WITH_PLUGIN : BASELINE_BARE).join("\n"),
    );
  });
});

/**
 * ⚑ The baseline is the DEFECT LEDGER, not a snapshot to refresh. A cell moving
 * to `BYPASS` is the regression this file exists to catch; a cell leaving it is
 * the fix, and the line is deleted by hand so the fix is read rather than
 * absorbed.
 */
const BASELINE_BARE: readonly string[] = [
  "addEventListener · bad event name → BYPASS",
  "addEventListener · non-function listener → BYPASS",
  "emitTransitionError · non-error value → same",
  "forwardState · junk search channel → same",
  "forwardState · boxed route name → same",
  "makeState · mis-channelled key → same",
  "makeState · drifting bag → BYPASS",
  "makeState · boxed route name → same",
  "matchPath · non-string path → same",
  "matchPath · boxed path → same",
  "navigateToState · non-boolean options flag → same",
  "navigateToState · state.name is an object → same",
  "setRootPath · non-string → same",
  "setRootPath · boxed string → same",
  "navigateToNotFound · non-string → BYPASS",
  "navigateToNotFound · boxed string → BYPASS",
  "navigateToNotFound · omitted argument → same",
  "start · non-string → same",
  "start · boxed string → same",
];

const BASELINE_WITH_PLUGIN: readonly string[] = [
  "addEventListener · bad event name → BYPASS",
  "addEventListener · non-function listener → BYPASS",
  "emitTransitionError · non-error value → same",
  "forwardState · junk search channel → BYPASS",
  "forwardState · boxed route name → BYPASS",
  "makeState · mis-channelled key → same",
  "makeState · drifting bag → BYPASS",
  "makeState · boxed route name → BYPASS",
  "matchPath · non-string path → same",
  "matchPath · boxed path → BYPASS",
  "navigateToState · non-boolean options flag → BYPASS",
  "navigateToState · state.name is an object → shape",
  "setRootPath · non-string → same",
  "setRootPath · boxed string → BYPASS",
  "navigateToNotFound · non-string → BYPASS",
  "navigateToNotFound · boxed string → BYPASS",
  "navigateToNotFound · omitted argument → same",
  "start · non-string → same",
  "start · boxed string → same",
];
