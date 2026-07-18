import { describe, expect, it } from "vitest";

import { isStateStrict } from "../../src/browser-env/state-guard";

/**
 * Stack-safety sentinel for the shared/browser-env `isStateStrict` twin (M1). Its
 * `isParams` closure runs at the popstate validation boundary on UNTRUSTED
 * `history.state` (any script on the page can set it), so the recursive-tree walk
 * must stay iterative — a regression to native recursion throws
 * `RangeError: Maximum call stack size exceeded` on a deep params chain.
 *
 * This mirrors validation-plugin's serializable-scale S1 for the browser-env copy
 * (byte-identical lockstep twin). 500k is ~200x V8's ~2.4k native frame limit.
 */
const deepObjectChain = (depth: number, leaf: unknown): unknown => {
  let node: unknown = leaf;

  for (let i = 0; i < depth; i++) {
    node = { child: node };
  }

  return node;
};

describe("state-guard: deep history.state params validate without call-stack overflow", () => {
  const DEPTH = 500_000;

  it("accepts a 500k-deep valid params tree through isStateStrict (no RangeError)", () => {
    const state = {
      name: "deep",
      path: "/deep",
      params: deepObjectChain(DEPTH, { leaf: 1 }),
    };

    expect(isStateStrict(state)).toBe(true);
  });

  it("rejects a 500k-deep params tree with a back-edge to the root as circular", () => {
    const root: Record<string, unknown> = {};
    let current = root;

    for (let i = 0; i < DEPTH; i++) {
      const next: Record<string, unknown> = {};

      current.child = next;
      current = next;
    }

    current.back = root;

    expect(isStateStrict({ name: "deep", path: "/deep", params: root })).toBe(
      false,
    );
  });
});
