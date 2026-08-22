import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * `packages/core/src/engine/CLAUDE.md` states the contract the `#737`
 * swallow-by-default design rests on:
 *
 * > `match()` must never throw on INPUT because its callers do not catch
 * > (`browser-plugin`, `hash-plugin`, four sites in `navigation-plugin`,
 * > `ssr-utils.getStaticPaths`, and `preload-plugin`'s `mouseover` listener).
 *
 * It was enforced on the QUERY channel only — `assignParam`'s `defineProperty`
 * guard and the `try` around `parseQueryString` are both search-params-only —
 * and unenforced on the PATH channel, by the same defect class the catch was
 * widened to swallow (#1840).
 *
 * ⚠ Every cell here plants its property on `Object.prototype` and removes it in
 * `afterEach`. A leak poisons every later cell in the worker, so the removal is
 * unconditional rather than inside the `try`.
 */
const PLANTED: string[] = [];

const plant = (name: string, descriptor: PropertyDescriptor): void => {
  // ⚠ `configurable` LAST. Spread first and a descriptor carrying
  // `configurable: false` wins, `Reflect.deleteProperty` then returns `false`
  // instead of throwing, and the property stays on `Object.prototype` for the
  // rest of the file with no diagnostic.
  Object.defineProperty(Object.prototype, name, {
    ...descriptor,
    configurable: true,
  });
  PLANTED.push(name);
};

const mk = () =>
  createRouter([
    { name: "dyn", path: "/u/:id" },
    { name: "stat", path: "/s" },
  ] as never);

describe("match() never throws on INPUT — the PATH channel (#1840)", () => {
  // ⚑ The list is a COUNT, so it can go to zero silently: delete the
  // `PLANTED.push` and every cell still passes while nothing is ever removed.
  // This asserts the prototype is clean on entry, which reds that mutant, a
  // failed `deleteProperty`, and any future leak.
  // ⚠ `throw`, not `expect`: `vitest/no-standalone-expect` refuses an assertion
  // outside a test block, and it is right to — a hook assertion is a setup
  // invariant, not a case. A throw here fails the cell just as loudly and needs
  // no suppression.
  beforeEach(() => {
    if (PLANTED.length > 0) {
      throw new Error(
        `hostile properties leaked from a previous cell: ${PLANTED.join(", ")}`,
      );
    }
  });

  afterEach(() => {
    for (const name of PLANTED.splice(0)) {
      if (!Reflect.deleteProperty(Object.prototype, name)) {
        throw new Error(
          `could not remove "${name}" from Object.prototype — it stays for the rest of the file`,
        );
      }
    }
  });

  it("survives an enumerable NON-STRING planted on Object.prototype", () => {
    const router = mk();
    const match = getPluginApi(router).matchPath;

    // CONTROL — the instrument sees a healthy match before anything is planted.
    expect(match("/u/7")?.name).toBe("dyn");

    // `#decodeParams` walks the params bag with `for…in`, so an enumerable
    // member of `Object.prototype` is iterated and `value.includes("%")` is
    // called on it. A number has no `.includes`.
    plant("rrNum", { value: 42, enumerable: true, writable: true });

    // ⚠ BOTH, and they name different failures. `not.toThrow()` alone is green
    // when `match()` returns `undefined`, which is the OTHER half of this defect
    // — the silent outage. Mutating the gate's `continue` to `return false`
    // reproduces exactly that and passes a `not.toThrow()`-only cell.
    expect(() => match("/u/7")).not.toThrow();
    expect(match("/u/7")?.name).toBe("dyn");

    // ⚠ A param that actually ENTERS the walk. `/s` was here instead and
    // discriminated nothing: a route with no params is served from
    // `#staticCache` and never reaches `#decodeParams` at all, so disabling the
    // walk wholesale left the cell green. Its own comment said "immune either
    // way", which is the refutation.
    expect(match("/u/%41")?.params.id).toBe("A");
  });

  it("survives an enumerable BAD PERCENT SEQUENCE planted on Object.prototype", () => {
    const router = mk();
    const match = getPluginApi(router).matchPath;

    expect(match("/u/7")?.name).toBe("dyn"); // CONTROL

    // `%E0%41` is syntactically valid and semantically invalid UTF-8, so it
    // passes `validatePercentEncoding` and makes `decodeURIComponent` throw —
    // which `#decodeParams` turns into `return false`, i.e. EVERY dynamic URL
    // silently stops matching. Not a throw; a total, diagnostic-free outage.
    plant("rrPct", { value: "%E0%41", enumerable: true, writable: true });

    expect(match("/u/7")?.name).toBe("dyn");
  });

  it("survives an enumerable planted on Object.prototype under strictQueryParams", () => {
    // ⚠ A SECOND route shape, and it had to be written: the gate on the
    // `strictQueryParams` walk shipped GREEN under mutation with only the cells
    // above, because none of them turns that mode on. The term was real and
    // guarded by nothing — found by reverting it, not by reading it.
    const router = createRouter(
      [{ name: "q", path: "/q?declared" }] as never,
      { queryParamsMode: "strict" } as never,
    );
    const match = getPluginApi(router).matchPath;

    // CONTROL, both directions: a declared key matches, an undeclared one is
    // refused — so the cell can tell "the gate works" from "strict mode stopped
    // refusing anything".
    expect(match("/q?declared=1")?.name).toBe("q");
    expect(match("/q?undeclared=1")).toBeUndefined();

    // The walk tests every enumerated key against the declared set. An
    // inherited enumerable is of course not in it, so before the gate ONE
    // ambient `Object.prototype.foo = 1` unmatched every query-bearing URL
    // under this mode.
    plant("rrAmbient", { value: 1, enumerable: true, writable: true });

    expect(match("/q?declared=1")?.name).toBe("q");
    expect(match("/q?undeclared=1")).toBeUndefined();
  });

  it("holds when a late polyfill re-points Object.hasOwn", () => {
    // ⚑ The gate calls the module-level `const hasOwn = Object.hasOwn`, not the
    // global, and that distinction is invisible to `chain-walk-authority`:
    // rewriting the gate as an inline `Object.hasOwn(...)` leaves its census
    // GREEN while measurably weakening the guard. Measured. This cell is what
    // tells the two apart, so the doctrine `SegmentMatcher`'s own header states
    // — "an application can re-point any of these AFTER boot" — has a test
    // rather than only a paragraph.
    const router = createRouter([{ name: "dyn", path: "/u/:id" }] as never);
    const match = getPluginApi(router).matchPath;
    const real = Object.hasOwn;

    expect(match("/u/7")?.name).toBe("dyn"); // CONTROL, before anything moves

    try {
      // The ordinary naive polyfill: it walks the chain, so an inline caller
      // would admit every inherited key and the defect would be back.
      Object.hasOwn = (o: object, k: PropertyKey): boolean => k in o;
      plant("rrNum", { value: 42, enumerable: true, writable: true });

      expect(() => match("/u/7")).not.toThrow();
      expect(match("/u/7")?.name).toBe("dyn");
    } finally {
      Object.hasOwn = real;
    }

    // CONTROL that the swap really was in force: the naive polyfill answers
    // `true` for an inherited key, which the real one does not. Without this the
    // cell would pass on a polyfill that never took effect.
    const naive = (o: object, k: PropertyKey): boolean => k in o;

    expect(naive({}, "toString")).toBe(true);
    expect(Object.hasOwn({}, "toString")).toBe(false);
  });

  // ── BOUNDARY — the WRITE half of the same class, tracked as #1852 ────────
  //
  // These two pin what core does TODAY rather than what the contract asks for,
  // deliberately: the limit is a measurement instead of a silent gap.
  //
  // ⚠ What they do NOT pin, measured: the SITE. Neutralising
  // `SegmentMatcher`'s param write with `Object.defineProperty` leaves both
  // cells green — the same key is written again downstream on the same
  // `matchPath` arc by `normalizeChannel` (`helpers.ts`), and the throw simply
  // moves there. So these cells assert "the axis is open", never "this site is
  // open", and #1852 will not be observable here until BOTH are closed.
  //
  // That also corrects the cost estimate this file used to carry: pricing the
  // fix at 6-9x `Object.defineProperty` on ONE loop understates an axis with at
  // least two live sites on the match() path alone.
  //
  // The split is not arbitrary. The two halves need DIFFERENT environmental
  // preconditions, measured:
  //
  //   on Object.prototype          [[Set]] write        for…in walk (above)
  //   plain enumerable data        fine (own prop)      BREAKS
  //   non-writable data            THROWS               fine
  //   getter-only accessor         THROWS               fine
  //   throwing setter              THROWS               fine
  //
  // So the half fixed above fires on an ordinary library extension
  // (`Object.prototype.foo = 1`, no attacker), while this half needs an
  // accessor or a non-writable property. And the cost is not comparable:
  // `Object.defineProperty` measures 6-9x plain assignment on the loop it was
  // benchmarked on — `normalizeChannel`'s, which does run per navigation and per
  // `<Link>` render. ⚠ NOT on the matcher's own loops; that transfer is
  // unmeasured, and saying "on these loops" spent a number earned elsewhere.

  it("BOUNDARY — an inherited ACCESSOR named like a route param still throws (#1852)", () => {
    const router = mk();
    const match = getPluginApi(router).matchPath;

    expect(match("/u/7")?.name).toBe("dyn"); // CONTROL

    // `#traverse` writes the captured segment with `params[pc.name] = segment`,
    // and a getter-only inherited property makes that plain assignment throw.
    // ⚠ `pc.name` comes from the ROUTE TABLE — a fully trusted source — which is
    // why the class cannot be described as "an untrusted key": the trap is the
    // ambient prototype, not the name.
    plant("id", { get: () => "X", enumerable: false });

    expect(() => match("/u/7")).toThrow(TypeError);
    // The discriminator: a static route takes no param write, so if the throw
    // came from something every match shares, this throws too. Here the
    // static-cache immunity that made `/s` useless above is the asset.
    expect(match("/s")?.name).toBe("stat");
  });

  it("BOUNDARY — an inherited THROWING SETTER still escapes (#1852)", () => {
    const router = mk();
    const match = getPluginApi(router).matchPath;

    expect(match("/u/7")?.name).toBe("dyn"); // CONTROL

    plant("id", {
      get: () => undefined,
      set: () => {
        throw new RangeError("application setter");
      },
      enumerable: false,
    });

    // The application's OWN error, escaping `match()` — the sharpest form,
    // because nothing in the stack between the setter and the caller is core's.
    // ⚠ By MESSAGE, not by class: `RangeError` is also V8's class for stack
    // overflow and `new Array(-1)`, so the class alone would be satisfied by an
    // error core threw.
    expect(() => match("/u/7")).toThrow("application setter");
    expect(match("/s")?.name).toBe("stat");
  });
});
