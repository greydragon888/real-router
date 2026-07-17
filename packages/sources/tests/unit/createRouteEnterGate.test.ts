import { describe, it, expect } from "vitest";

import { createRouteEnterGate } from "../../src/createRouteEnterGate.js";

import type { State } from "@real-router/core";

// The gate is pure over `route.name`, `route.transition.from`, and reference
// identity — a minimal structural fake gives precise truth-table control.
const mkState = (name: string, from?: string): State =>
  ({ name, transition: { from } }) as unknown as State;

describe("createRouteEnterGate", () => {
  it("skips when route is undefined (arm 1 — svelte SSR / pre-start)", () => {
    const gate = createRouteEnterGate();

    expect(gate(undefined, mkState("home"), true)).toBeNull();
  });

  it("skips the initial commit — transition.from undefined (arm 2, skip-initial)", () => {
    const gate = createRouteEnterGate();

    expect(gate(mkState("home"), mkState("x"), true)).toBeNull();
  });

  it("skips a same-route navigation when skipSameRoute is true (arm 3)", () => {
    const gate = createRouteEnterGate();

    // transition.from === name → query-only / sort-filter navigation
    expect(gate(mkState("users", "users"), mkState("home"), true)).toBeNull();
  });

  it("fires a same-route navigation when skipSameRoute is false", () => {
    const gate = createRouteEnterGate();
    const route = mkState("users", "users");
    const previousRoute = mkState("home");

    expect(gate(route, previousRoute, false)).toStrictEqual({
      route,
      previousRoute,
    });
  });

  it("dedupes the same snapshot reference — dispatches exactly once (arm 4)", () => {
    const gate = createRouteEnterGate();
    const route = mkState("users", "home");
    const previousRoute = mkState("home");

    expect(gate(route, previousRoute, true)).toStrictEqual({
      route,
      previousRoute,
    });
    // same reference again → skipped (StrictMode double-invoke guard)
    expect(gate(route, previousRoute, true)).toBeNull();
  });

  it("skips when previousRoute is undefined — the non-nullable contract guard (arm 5, #1218)", () => {
    const gate = createRouteEnterGate();

    expect(gate(mkState("users", "home"), undefined, true)).toBeNull();
  });

  it("returns the enter context on a genuine navigation (happy path)", () => {
    const gate = createRouteEnterGate();
    const route = mkState("users", "home");
    const previousRoute = mkState("home");

    expect(gate(route, previousRoute, true)).toStrictEqual({
      route,
      previousRoute,
    });
  });

  it("holds dedupe state per gate instance — independent gates do not share", () => {
    const route = mkState("users", "home");
    const previousRoute = mkState("home");
    const g1 = createRouteEnterGate();
    const g2 = createRouteEnterGate();

    expect(g1(route, previousRoute, true)).not.toBeNull();
    // g2 has its own lastHandledRoute → still fires for the same reference
    expect(g2(route, previousRoute, true)).not.toBeNull();
  });
});
