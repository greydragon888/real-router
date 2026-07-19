import { describe, expect, it } from "vitest";

import { EMPTY_STATIC_CHILDREN } from "../../../../src/engine/path-matcher/pathUtils";
import { createSegmentNode } from "../../../../src/engine/path-matcher/SegmentMatcher";

/**
 * KEEP-narrow white-box exception (allowlisted in packages/path-matcher/eslint.config.mjs).
 *
 * `createSegmentNode` + `EMPTY_STATIC_CHILDREN` are INTERNAL trie-node primitives. Their
 * observable behaviour — a fresh node has no children, gains a static child on
 * registration, and matches — is fully covered through the public API in
 * `SegmentMatcher.test.ts` (`registerTree` + `match`). What is pinned HERE is the MEMORY /
 * hidden-class contract the public surface cannot observe and no consumer ever sees:
 *   - the uniform key order (#1009 — one hidden class, no megamorphic node/CompiledRoute);
 *   - the shared frozen null-proto `EMPTY_STATIC_CHILDREN` sentinel + copy-on-write
 *     (#1009 / #1379, ~10% table-heap: a fresh node shares the ONE sentinel until a real
 *     static child is written, which swaps in a fresh mutable map).
 * These are only assertable by inspecting the node directly — hence the exception.
 */
describe("createSegmentNode (internal node/memory invariants)", () => {
  it("should create node with all properties initialized", () => {
    const node = createSegmentNode();

    expect(node).toHaveProperty("staticChildren");
    expect(node).toHaveProperty("paramChild");
    expect(node).toHaveProperty("splatChild");
    expect(node).toHaveProperty("route");
    expect(node).toHaveProperty("slashChildRoute");
  });

  it("should initialize optional properties to undefined", () => {
    const node = createSegmentNode();

    expect(node.paramChild).toBeUndefined();
    expect(node.splatChild).toBeUndefined();
    expect(node.route).toBeUndefined();
    expect(node.slashChildRoute).toBeUndefined();
  });

  it("should initialize staticChildren to the shared frozen empty sentinel", () => {
    const node = createSegmentNode();

    // Null-proto (Object.create(null)) empty map, frozen so a write that skips
    // processSegment's copy-on-write fails loud instead of corrupting the shared shell.
    expect(Object.getPrototypeOf(node.staticChildren)).toBeNull();
    expect(node.staticChildren).toBe(EMPTY_STATIC_CHILDREN);
    expect(Object.isFrozen(node.staticChildren)).toBe(true);
  });

  it("should share the empty sentinel across fresh nodes (copy-on-write on first static child)", () => {
    const node1 = createSegmentNode();
    const node2 = createSegmentNode();

    // Distinct node objects, but both point at the ONE shared staticChildren
    // sentinel — until registration adds a static child, which copies-on-write.
    expect(node1).not.toBe(node2);
    expect(node1.staticChildren).toBe(node2.staticChildren);
    expect(node1.staticChildren).toBe(EMPTY_STATIC_CHILDREN);
  });

  it("should have uniform hidden class shape (all keys present)", () => {
    const node = createSegmentNode();
    const keys = Object.keys(node);

    expect(keys).toStrictEqual([
      "staticChildren",
      "hasChildren",
      "paramChild",
      "splatChild",
      "route",
      "slashChildRoute",
    ]);
  });
});
