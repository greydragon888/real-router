import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";

/**
 * The two doors that share `isPlainBag`, answering the same values (#2243).
 *
 * `guardDependencyShape` and `assertExtensionsShape` run one predicate, so a
 * claim about what one accepts is a claim about the other — and that claim was
 * written in prose three times before this table existed, wrong once. A ledger
 * reds when the pair parts; a sentence does not.
 *
 * ⚠ The vector set is CHOSEN, not derived: these are input classes, and no scan
 * of `src` can enumerate them. What is derived is the OUTCOME — each value is
 * run through both live doors. The length is asserted so the set cannot shrink
 * silently.
 *
 * ⚠ Two rows diverge, and both are RECORDED rather than defects. They are the
 * reason this file states the parity as a table instead of as "the doors agree".
 */
const ROUTES = [{ name: "h", path: "/h" }];

/** `accepted`, or the CLASS of refusal — the class is what the pair is about. */
function settle(fn: () => unknown): string {
  try {
    fn();

    return "accepted";
  } catch (error) {
    const message = (error as Error).message;

    if (message.includes("plain object")) {
      return "REFUSED(shape)";
    }

    if (message.includes("getters")) {
      return "REFUSED(getter)";
    }

    return `REFUSED(other)`;
  }
}

class NotAPlainBag {
  probeKey = 1;
}

/**
 * Factories, never fixed values: the accessor row is spent by the first door it
 * reaches, so a shared instance would hand the second door a different object
 * and the table would read `same` for the wrong reason.
 */
const VECTORS: readonly (readonly [label: string, make: () => unknown])[] = [
  ["object literal", () => ({ probeKey: 1 })],
  [
    "null-prototype bag",
    () => {
      const bag = Object.create(null) as Record<string, unknown>;

      bag.probeKey = 1;

      return bag;
    },
  ],
  [
    // The row that separates this predicate from `engine/validation/route-batch`,
    // which asks `proto !== Object.prototype` and refuses this shape.
    "bag whose proto is a plain object",
    () => {
      const bag = Object.create({ inherited: 1 }) as Record<string, unknown>;

      bag.probeKey = 1;

      return bag;
    },
  ],
  ["array", () => ["a"]],
  [
    // ⚠ The shape gate reads the PROTOTYPE, and a `Proxy` traps that read — so
    // one lie walks a non-bag past a gate that refuses the same value bare
    // (#2282). The row above is the control: without the trap it is refused.
    "array behind a lying prototype",
    () =>
      new Proxy(["a"] as unknown as Record<string, unknown>, {
        getPrototypeOf: () => Object.prototype,
      }),
  ],
  ["class instance", () => new NotAPlainBag()],
  ["string", () => "ab"],
  ["number", () => 7],
  ["null", () => null],
  ["undefined", () => undefined],
  [
    "accessor-backed bag",
    () =>
      Object.defineProperty({}, "probeKey", {
        enumerable: true,
        get: () => 1,
      }),
  ],
];

function ledger(): string[] {
  return VECTORS.map(([label, make]) => {
    const dependency = settle(() => createRouter(ROUTES, {}, make() as never));
    const extension = settle(() =>
      getPluginApi(createRouter(ROUTES, {}, {})).extendRouter(make() as never),
    );

    return `${label} · dependency=${dependency} · extendRouter=${extension}`;
  });
}

/**
 * ⚑ The BASELINE is a ledger, not a snapshot to refresh. A row moving is either
 * the pair parting — the regression this file exists to catch — or a divergence
 * closing, and the line is edited by hand so either is read rather than absorbed.
 */
const BASELINE: readonly string[] = [
  "object literal · dependency=accepted · extendRouter=accepted",
  "null-prototype bag · dependency=accepted · extendRouter=accepted",
  "bag whose proto is a plain object · dependency=accepted · extendRouter=accepted",
  "array · dependency=REFUSED(shape) · extendRouter=REFUSED(shape)",
  "array behind a lying prototype · dependency=REFUSED(shape) · extendRouter=REFUSED(shape)",
  "class instance · dependency=REFUSED(shape) · extendRouter=REFUSED(shape)",
  "string · dependency=REFUSED(shape) · extendRouter=REFUSED(shape)",
  "number · dependency=REFUSED(shape) · extendRouter=REFUSED(shape)",
  "null · dependency=REFUSED(shape) · extendRouter=REFUSED(shape)",
  "undefined · dependency=accepted · extendRouter=REFUSED(shape)",
  "accessor-backed bag · dependency=REFUSED(getter) · extendRouter=accepted",
];

/**
 * The two rows allowed to differ, and nothing else — in `VECTORS` order, so a
 * reordering is as visible as an addition.
 */
const RECORDED_DIVERGENCES: readonly string[] = [
  "undefined",
  "accessor-backed bag",
];

describe("the two `isPlainBag` doors answer the same values (#2243)", () => {
  it("the ledger", () => {
    // Joined, not array-compared: vitest elides a ten-element array diff and
    // prints a string one in full, which is the whole value of a ledger.
    expect(ledger().join("\n")).toBe(BASELINE.join("\n"));
  });

  // CONTROL — the derivation itself, in both polarities. Without it the ledger
  // above is satisfied by an empty vector set, and by a table where every row
  // says the same thing.
  it("CONTROL — the set is neither empty nor all one answer", () => {
    expect(VECTORS).toHaveLength(11);

    const rows = ledger();
    const agreeing = rows.filter((r) => {
      const [, dependency, extension] = r.split(" · ", 3);

      return (
        dependency.slice("dependency=".length) ===
        extension.slice("extendRouter=".length)
      );
    });

    expect(agreeing.length).toBeGreaterThan(0);
    expect(agreeing.length).toBeLessThan(rows.length);
  });

  it("exactly two rows diverge, and they are the recorded pair", () => {
    const diverging = ledger()
      .filter((r) => {
        const [, dependency, extension] = r.split(" · ", 3);

        return (
          dependency.slice("dependency=".length) !==
          extension.slice("extendRouter=".length)
        );
      })
      .map((r) => r.split(" · ", 1)[0]);

    expect(diverging).toStrictEqual(RECORDED_DIVERGENCES);
  });

  // ⚠ The `undefined` row is a VERDICT ON A PREMISE, and the premise is what
  // this cell checks: the dependency door does not ADMIT `undefined` — the value
  // never reaches the guard, because `createRouter`'s parameter defaults to `{}`.
  // Reading "accepted" as "the predicate allows it" would be the wrong lesson,
  // and `extendRouter` has no default to fall back on.
  it("`undefined` is a DEFAULT at one door, not an admission", () => {
    const router = createRouter(ROUTES, {}, undefined as never);

    expect(getDependenciesApi(router).getAll()).toStrictEqual({});
  });

  // ⚠ The accessor row is not the predicate either: `isPlainBag` accepts the bag
  // at both doors. The dependency path refuses it later, on the store's copy
  // walk (#1861); `extendRouter` reads values deliberately, one at a time, which
  // is the contract `handed-out-containers` and its own docs pin.
  it("the accessor bag is refused BELOW the shared predicate", () => {
    const accessorBag = (): Record<string, unknown> =>
      Object.defineProperty({}, "probeKey", {
        enumerable: true,
        get: () => 1,
      });

    expect(() => createRouter(ROUTES, {}, accessorBag() as never)).toThrow(
      /getters/,
    );

    const router = createRouter(ROUTES, {}, {});

    getPluginApi(router).extendRouter(accessorBag());

    expect((router as unknown as Record<string, unknown>).probeKey).toBe(1);
  });
});
