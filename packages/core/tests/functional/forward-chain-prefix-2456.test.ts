import { describe, expect, it } from "vitest";

import { createRouter, resolveForwardChain } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

/**
 * Every forward-chain refusal names `[router]` (#2456).
 *
 * Two families reach these messages and neither knows a single call name.
 * `resolveForwardChain` runs at REGISTRATION, from every door that registers a
 * forward and from a direct call — it is a root export. `#resolveDynamicForward` runs on the MATCH path,
 * so `start`, `navigate` and the plugin primitives all surface it. #1845 ruled
 * on exactly this shape for the twelve `registration/errors.ts` messages: a
 * single call name would be false at the other doors, so the prefix is the bare
 * facade the caller typed.
 *
 * ⚑ A cell pins the prefix AND what the message says, on SEPARATE assertions.
 * `says` describes the body only. Anchoring it on the prefix instead makes the
 * `prefixOf` line unreachable — `toMatch` proves the prefix first — and with it
 * the `<no prefix>` answer that turns a LOST prefix into a readable mismatch
 * rather than a `TypeError`. The split is the shape `route-door-prefix-2399`
 * uses, and the reason its `prefixOf` is load-bearing.
 */

/** The body every cycle cell matches; the prefix is asserted separately. */
const CYCLE = /Circular forwardTo: /u;

const cyclicPair: Route[] = [
  { name: "a", path: "/a", forwardTo: "b" },
  { name: "b", path: "/b", forwardTo: "a" },
];

/** `n` routes, each a static forward to the next — overruns the depth cap. */
const staticChain = (n: number): Route[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `r${i}`,
    path: `/r${i}`,
    ...(i < n - 1 && { forwardTo: `r${i + 1}` }),
  }));

/** One route whose `forwardTo` is a CALLBACK — the match-path family. */
const dynamic = (forwardTo: unknown): Router =>
  createRouter([
    { name: "home", path: "/" },
    { name: "d", path: "/d", forwardTo },
  ] as unknown as Route[]);

/** `n` routes, each a CALLBACK forward to the next. */
const dynamicChain = (n: number): Router =>
  createRouter(
    Array.from({ length: n }, (_, i) => ({
      name: `c${i}`,
      path: `/c${i}`,
      ...(i < n - 1 && { forwardTo: () => `c${i + 1}` }),
    })) as unknown as Route[],
  );

interface Cell {
  readonly door: string;
  readonly what: string;
  readonly says: RegExp;
  readonly trigger: () => unknown;
}

const REGISTRATION: Cell[] = [
  {
    door: "createRouter",
    what: "a pair of routes forwarding to each other",
    says: CYCLE,
    trigger: () => createRouter(cyclicPair),
  },
  {
    door: "routes.add",
    what: "the added batch closes a cycle",
    says: CYCLE,
    trigger: () => {
      getRoutesApi(createRouter([{ name: "home", path: "/" }])).add(cyclicPair);
    },
  },
  {
    door: "routes.replace",
    what: "the replacing batch closes a cycle",
    says: CYCLE,
    trigger: () => {
      getRoutesApi(createRouter([{ name: "home", path: "/" }])).replace(
        cyclicPair,
      );
    },
  },
  {
    door: "routes.update",
    what: "the patched forwardTo closes a cycle",
    says: CYCLE,
    trigger: () => {
      getRoutesApi(
        createRouter([
          { name: "a", path: "/a" },
          { name: "b", path: "/b", forwardTo: "a" },
        ]),
      ).update("a", { forwardTo: "b" });
    },
  },
  {
    door: "createRouter",
    what: "a static chain longer than the depth cap",
    says: /forwardTo chain exceeds maximum depth \(100\): /u,
    trigger: () => createRouter(staticChain(140)),
  },
  {
    door: "resolveForwardChain",
    what: "the root export called directly — no facade door to name",
    says: CYCLE,
    trigger: () => resolveForwardChain("a", { a: "b", b: "a" }),
  },
];

const MATCH_PATH: Cell[] = [
  {
    door: "pluginApi.forwardState",
    what: "a callback forwarding to its own route",
    says: CYCLE,
    trigger: () => getPluginApi(dynamic(() => "d")).forwardState("d", {}),
  },
  {
    door: "pluginApi.forwardState",
    what: "a callback naming a route the table does not hold",
    says: /Route "ghost" does not exist$/u,
    trigger: () => getPluginApi(dynamic(() => "ghost")).forwardState("d", {}),
  },
  {
    door: "pluginApi.forwardState",
    what: "a callback returning something that is not a string",
    says: /forwardTo callback must return a string, got number$/u,
    trigger: () => getPluginApi(dynamic(() => 42)).forwardState("d", {}),
  },
  {
    door: "pluginApi.forwardState",
    what: "a callback chain longer than the depth cap",
    says: /forwardTo exceeds maximum depth of 100$/u,
    trigger: () => getPluginApi(dynamicChain(140)).forwardState("c0", {}),
  },
  {
    door: "pluginApi.matchPath",
    what: "the matcher resolves the callback forward",
    says: CYCLE,
    trigger: () => getPluginApi(dynamic(() => "d")).matchPath("/d"),
  },
];

const prefixOf = (error: unknown): string =>
  (/^\[[^\]]+]/.exec((error as Error).message) ?? ["<no prefix>"])[0];

const assertCell = ({ says, trigger }: Cell): void => {
  let raised: unknown;

  try {
    trigger();
  } catch (error) {
    raised = error;
  }

  expect(raised).toBeInstanceOf(Error);
  expect((raised as Error).message).toMatch(says);
  expect(prefixOf(raised)).toBe("[router]");
  // One subsystem per message: a second wrapper prepending its own head would
  // leave `prefixOf` answering `[router]` and pass the line above.
  expect((raised as Error).message).not.toMatch(/\] \[/u);
};

describe("every forward-chain refusal names [router] (#2456)", () => {
  it("both tables are populated — an each over an empty list is silent", () => {
    // `table-vacuity-authority` is what makes this mechanical rather than
    // remembered: a count asserted OUTSIDE the `each` is the only thing that
    // discriminates a shrunk table from a passing one.
    expect(REGISTRATION).toHaveLength(6);
    expect(MATCH_PATH).toHaveLength(5);
    // ⚠ CARDINALITY of the doors, not coverage of them — nothing here derives
    // the door set from the tree. Without it, six copies of one cell satisfy the
    // lengths above and the file measures one door six times.
    expect(new Set(REGISTRATION.map((cell) => cell.door)).size).toBe(5);
    expect(new Set(MATCH_PATH.map((cell) => cell.door)).size).toBe(2);
  });

  describe("registration — resolveForwardChain", () => {
    // eslint-disable-next-line vitest/expect-expect -- assertions live in assertCell()
    it.each(REGISTRATION)("$door: $what", assertCell);
  });

  describe("match path — #resolveDynamicForward", () => {
    // eslint-disable-next-line vitest/expect-expect -- assertions live in assertCell()
    it.each(MATCH_PATH)("$door: $what", assertCell);
  });

  it("start() rejects with the prefixed message, not just the sync doors", async () => {
    // The match-path family reaches a caller through a REJECTED PROMISE as well
    // as a throw, and a helper that awaits inside `try` cannot tell the two
    // apart — so this arm is asserted on its own.
    await expect(dynamic(() => "d").start("/d")).rejects.toThrow(CYCLE);
  });

  it("CONTROL — a neighbouring refusal of the same door names the door itself", () => {
    // Anti-vacuum for the table above: `[router]` is NOT what every refusal of
    // these doors says, so a fix that prefixed indiscriminately would show up
    // here. `add` names its own door when the batch re-declares a route, and
    // that one knows which call it is.
    //
    // ⚠ The first draft used the forwardTo-target-missing refusal, which bare
    // core does not raise — `@real-router/validation-plugin` owns it (#2399) —
    // so the control failed for a reason that had nothing to do with prefixes.
    expect(() => {
      getRoutesApi(createRouter([{ name: "home", path: "/" }])).add([
        { name: "home", path: "/elsewhere" },
      ]);
    }).toThrow(/^\[router\.addRoute\] Route "home" already exists/u);
  });
});
