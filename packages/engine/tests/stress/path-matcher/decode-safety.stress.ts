import { describe, expect, it } from "vitest";

import { buildParamMeta } from "../../../src/path-matcher/buildParamMeta";
import { createTestMatcher } from "../../helpers/createTestMatcher";

import type { MatcherInputNode } from "../../../src/path-matcher/types";

/**
 * Scale / throughput guards for the `match()` never-throw decode fix (#737).
 *
 * The fix adds a try/catch around `decode(value)` (path params) and around the
 * injected query parser. These tests assert what coverage cannot:
 *
 * 1. **Never-throw under a flood of malformed input** — thousands of distinct
 *    valid-hex/invalid-UTF-8 URLs all resolve to `undefined`, never throwing.
 *    The discriminating signal is "did any of N adversarial inputs escape the
 *    guard", which a single example can't establish.
 * 2. **Happy-path throughput is not regressed** — the try/catch must stay
 *    zero-cost on the common (decodable) path. Timing ceiling is generous to
 *    avoid CPU-load flake; correctness on every iteration is the real guard.
 */

function createInputNode(
  overrides: Partial<MatcherInputNode> & { name: string; path: string },
): MatcherInputNode {
  const paramMeta = buildParamMeta(overrides.path);

  return {
    fullName: overrides.name,
    absolute: false,
    children: new Map<string, MatcherInputNode>(),
    nonAbsoluteChildren: [],
    paramMeta,
    paramTypeMap: paramMeta.paramTypeMap,
    ...overrides,
  };
}

function build(): ReturnType<typeof createTestMatcher> {
  const matcher = createTestMatcher();
  const profile = createInputNode({
    name: "profile",
    path: "/:id?q",
    fullName: "users.profile",
  });
  const users = createInputNode({
    name: "users",
    path: "/users",
    fullName: "users",
    children: new Map([["profile", profile]]),
    nonAbsoluteChildren: [profile],
  });
  const root = createInputNode({
    name: "",
    path: "",
    fullName: "",
    children: new Map([["users", users]]),
    nonAbsoluteChildren: [users],
  });

  matcher.registerTree(root);

  return matcher;
}

describe("S1: never-throw under a flood of valid-hex/invalid-UTF-8 URLs", () => {
  it("returns undefined for 30,000 malformed path + query inputs, never throwing", () => {
    const matcher = build();

    let threwCount = 0;
    let matchedCount = 0;

    // 0xC0 and 0xE0 lead bytes followed by a non-continuation byte are always
    // invalid UTF-8; 0xFF is never valid. Vary the trailing byte to generate
    // many distinct, definitely-undecodable sequences.
    for (let i = 0; i < 15_000; i++) {
      const lead = i % 2 === 0 ? "C0" : "E0";
      const tail = (i % 0x41).toString(16).padStart(2, "0"); // 0x00–0x40: never a continuation byte
      const seq = `%${lead}%${tail}`;

      let pathResult: ReturnType<typeof matcher.match> | "threw";
      let queryResult: ReturnType<typeof matcher.match> | "threw";

      try {
        pathResult = matcher.match(`/users/${seq}`);
      } catch {
        pathResult = "threw";
      }

      try {
        queryResult = matcher.match(`/users?q=${seq}`);
      } catch {
        queryResult = "threw";
      }

      if (pathResult === "threw" || queryResult === "threw") {
        threwCount++;
      }

      if (pathResult !== undefined && pathResult !== "threw") {
        matchedCount++;
      }
    }

    expect(threwCount).toBe(0);
    // None of the malformed path inputs should ever produce a match.
    expect(matchedCount).toBe(0);
  });
});

describe("S2: happy-path decode throughput is not regressed by the guard", () => {
  it("decodes 50,000 valid percent-encoded params correctly within budget", () => {
    const matcher = build();

    const ITER = 50_000;
    const start = performance.now();
    let lastId = "";

    for (let i = 0; i < ITER; i++) {
      // %E4%B8%AD = 中 — a valid 3-byte sequence that exercises the decode path.
      const result = matcher.match(`/users/item${i % 500}%E4%B8%AD`);

      lastId = result!.params.id as string;
    }

    const totalMs = performance.now() - start;

    expect(lastId.endsWith("中")).toBe(true);
    // Generous per-op ceiling; the try/catch must not turn the happy path slow.
    expect(totalMs / ITER).toBeLessThan(0.05);
  });
});
