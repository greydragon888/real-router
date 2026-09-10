import { describe, it, expect } from "vitest";
import { h } from "vue";

import { Match, NotFound } from "../../src/components/RouteView/components";
import { collectElements } from "../../src/components/RouteView/helpers";

import type { VNode } from "vue";

/**
 * Slot-tree flattening robustness for `<RouteView>` (#2203).
 *
 * SKEPTICAL HYPOTHESIS (not behaviour-pinning): `collectElements` flattened a
 * nested slot array by returning a fresh array per level and spreading it into
 * the parent — `result.push(...normalizeChildren(child))`. The spread passes
 * one argument per collected VNode, and V8 caps spread/apply arguments, so a
 * wide enough nested fragment throws `RangeError: Maximum call stack size
 * exceeded` — a message that reads like infinite recursion rather than "too
 * many children". The same shape was diagnosed and removed once before, in
 * `ssr-utils/getStaticPaths.ts` (#920), which carries a scale pin of its own.
 * ⚠ `core`'s `serialize-scale.stress.ts` is NOT a third instance, though its
 * name invites the reading: it guards an O(n²) re-scanning concat, and its
 * `parts.push(...)` is `push(x).join("&")` rather than a spread.
 *
 * ⚠ **The cap is stack-dependent, not a constant, so it is measured HERE and
 * the neighbouring pins' numbers do not transfer.** `get-static-paths-scale`
 * records ~124k for its own call site; in this one the boundary sat between
 * 400k and 500k across runs on the same machine and Node, because what gives
 * out is the remaining stack at the call, not a fixed argument limit. `WIDE` is
 * therefore chosen with margin over the measured boundary rather than over a
 * number borrowed from elsewhere.
 *
 * ⚠ **This is not the reason the spread was removed.** A `<RouteView>` slot
 * holds a handful of `<Match>` / `<Self>` / `<NotFound>` markers, so no real
 * application reaches this width. The reason is the intermediate array per
 * nested level on a render-hot path — which no test can observe directly, and
 * which is why the failure mode that IS observable gets the pin.
 */
describe("V21 — RouteView slot flattening at scale (#2203)", () => {
  // Above the boundary measured on this call site (400k–500k), with margin, so
  // the spread form throws deterministically across stack-depth drift.
  const WIDE = 1_000_000;

  it(`flattens ${WIDE} markers in a nested array without RangeError`, () => {
    const wide: VNode[] = Array.from({ length: WIDE }, (_, i) =>
      h(Match, { segment: `s${String(i)}` }),
    );
    const result: VNode[] = [];

    // One level of array nesting is all it takes: the inner array is what the
    // old code flattened into a fresh array and then spread.
    collectElements([wide], result);

    // No drop, and in slot order.
    expect(result).toHaveLength(WIDE);
    expect((result[0]?.props as { segment: string }).segment).toBe("s0");
    expect((result.at(-1)?.props as { segment: string }).segment).toBe(
      `s${String(WIDE - 1)}`,
    );
  });

  it("keeps every marker kind and drops every non-marker at depth", () => {
    // Depth as well as width: markers arrive through three levels of nesting,
    // interleaved with entries the walk must discard (a plain string, a null,
    // and a non-marker element whose own children hold nothing).
    const result: VNode[] = [];

    collectElements(
      [
        h(Match, { segment: "a" }),
        [
          "text",
          null,
          [h(NotFound), [h(Match, { segment: "b" })]],
          h("div", null, "not a marker"),
        ],
      ],
      result,
    );

    expect(result.map((node) => node.type)).toStrictEqual([
      Match,
      NotFound,
      Match,
    ]);
  });
});
