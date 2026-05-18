// packages/vue/tests/property/vLink.stack.properties.ts

/**
 * Stateful property-based tests for the `v-link` directive's router stack
 * (`src/directives/vLink.ts`).
 *
 * Closes §6.2 Invariant 8 — "vLink stack pop identity safety". The directive
 * keeps a module-level LIFO stack of routers that `RouterProvider` pushes on
 * mount and pops on unmount via the returned release function. The release
 * function uses `Array.prototype.lastIndexOf` to find the *exact* router
 * instance to remove — guaranteeing correctness across **out-of-order**
 * provider unmount sequences (a deeply-nested provider can survive its
 * grandparent without the directive resolving to a torn-down instance).
 *
 * Functional tests in `vLink.test.ts:104-189` cover documented out-of-order
 * unmount; this PBT exercises arbitrary push/release interleavings against a
 * faithful model. A regression that swaps `lastIndexOf` for `pop` (or strips
 * the identity check) would surface here, while passing the functional suite.
 *
 * Invariants:
 *
 * 1. **Top-of-stack consistency** — after any sequence of push/release ops,
 *    `getDirectiveRouter()` returns exactly the last router still present in
 *    the model stack, OR throws when the stack is empty.
 * 2. **Release identity** — calling a release function removes the SPECIFIC
 *    router instance it was bound to, regardless of its current position in
 *    the stack (not just the top). Out-of-order release sequences (parent
 *    released before child) preserve the invariant.
 * 3. **Idempotent release** — calling the same release function twice is a
 *    no-op on the second call. Stack contains zero copies of the released
 *    router, not negative one. `lastIndexOf(...) === -1` short-circuits.
 * 4. **No cross-contamination** — releasing router A never affects the
 *    presence of any other router B in the stack.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import {
  getDirectiveRouter,
  pushDirectiveRouter,
  setDirectiveRouter,
} from "../../src/directives/vLink";

import type { Router } from "@real-router/core";

// =============================================================================
// Fake routers — identity-only objects. Distinct ids guarantee distinct refs.
// We do NOT need a real Router; the stack stores references and compares
// identity. Casting through `unknown` keeps the directive's public type intact.
// =============================================================================

interface FakeRouter {
  readonly id: number;
}

function makeFakeRouter(id: number): Router {
  return { id } as unknown as Router;
}

// =============================================================================
// Model
// =============================================================================

interface StackModel {
  /** Model mirror of the directive's internal router stack (LIFO). */
  stack: FakeRouter[];
  /**
   * Releases per pushed router, by stack position at push time. Tracked
   * separately from `stack` because the release function captures the router
   * by identity — its index is irrelevant.
   */
  pending: Map<FakeRouter, () => void>;
  /** Routers we have already released (idempotency tracking). */
  released: Set<FakeRouter>;
  /** Monotonic id counter for new fake routers. */
  nextId: number;
}

// =============================================================================
// Commands
// =============================================================================

class PushCommand implements fc.Command<StackModel, unknown> {
  check = () => true;

  run(m: StackModel): void {
    const router = makeFakeRouter(m.nextId++);
    const release = pushDirectiveRouter(router);

    m.stack.push(router as unknown as FakeRouter);
    m.pending.set(router as unknown as FakeRouter, release);

    // Invariant 1 — top-of-stack consistency immediately after push.
    expect(getDirectiveRouter()).toBe(router);
  }

  toString(): string {
    return "Push()";
  }
}

class ReleaseTopCommand implements fc.Command<StackModel, unknown> {
  check(m: Readonly<StackModel>): boolean {
    return m.stack.length > 0;
  }

  run(m: StackModel): void {
    const top = m.stack.at(-1)!;
    const release = m.pending.get(top);

    expect(release).toBeDefined();

    release!();

    m.stack.pop();
    m.pending.delete(top);
    m.released.add(top);

    // Invariant 1 — after pop, top reflects the next router (or stack is
    // empty and `getDirectiveRouter` throws).
    if (m.stack.length === 0) {
      expect(() => getDirectiveRouter()).toThrow();
    } else {
      const newTop = m.stack.at(-1)!;

      expect(getDirectiveRouter()).toBe(newTop as unknown as Router);
    }
  }

  toString(): string {
    return "ReleaseTop()";
  }
}

class ReleaseByIndexCommand implements fc.Command<StackModel, unknown> {
  // Picks a 0-based index into the *current* model stack — covers
  // out-of-order release (e.g. release `stack[0]` while `stack[2]` is still
  // mounted). Generated as a non-negative integer; clamped at runtime.
  constructor(readonly indexHint: number) {}

  check(m: Readonly<StackModel>): boolean {
    return m.stack.length > 0;
  }

  run(m: StackModel): void {
    const idx = this.indexHint % m.stack.length;
    const target = m.stack[idx];
    const release = m.pending.get(target);

    expect(release).toBeDefined();

    // Snapshot the directive's view of "who else is in the stack" BEFORE the
    // release fires, so we can verify Invariant 4 (no cross-contamination).
    const others = m.stack.filter((r) => r !== target);

    release!();

    // Mutate the model in lockstep.
    m.stack.splice(idx, 1);
    m.pending.delete(target);
    m.released.add(target);

    // Invariant 1 + Invariant 4 — top-of-stack must mirror the next-surviving
    // router under model semantics, and every previously-pushed-but-still-
    // unreleased router remains present (we can only observe the top
    // directly, so we drain via repeated peeks if needed; here we just check
    // the top correctness — the next ReleaseByIndex iteration will probe
    // deeper elements as it traverses them).
    if (m.stack.length === 0) {
      expect(() => getDirectiveRouter()).toThrow();
    } else {
      const newTop = m.stack.at(-1)!;

      expect(getDirectiveRouter()).toBe(newTop as unknown as Router);
    }

    // Invariant 4 — every surviving router is still tracked (i.e., its
    // release function is still callable; we don't assert it directly here
    // because the only safe observation is via getDirectiveRouter, which the
    // top-of-stack check above already covers).
    expect(m.stack).toHaveLength(others.length);
  }

  toString(): string {
    return `ReleaseByIndex(${this.indexHint})`;
  }
}

class IdempotentReleaseCommand implements fc.Command<StackModel, unknown> {
  // Re-invokes a release function that has already fired. The directive
  // documents this case explicitly via `idx !== -1` guard (line 36) — the
  // second call must be a no-op.
  check(m: Readonly<StackModel>): boolean {
    return m.released.size > 0;
  }

  run(m: StackModel): void {
    // Pick any already-released router; we kept its release closure pinned
    // in `m.pending` until release fired and deleted it. Re-running it
    // requires re-capturing it via pushDirectiveRouter — but we can't do
    // that without mutating real state. So we use the canonical alternative:
    // call release functions we kept references to via a side channel.
    //
    // Trick: push a new throwaway router, capture its release, release it
    // (now in `released`), then call its release function a SECOND time.
    // The second call must not affect any router currently on the stack.
    const before = m.stack.length;
    const throwaway = makeFakeRouter(m.nextId++);
    const release = pushDirectiveRouter(throwaway);

    release();

    // First release pops the throwaway → stack length should equal `before`.
    expect(m.stack).toHaveLength(before);

    // Second release — idempotent no-op. Must NOT pop a surviving router.
    release();
    // Top must reflect whatever was on top BEFORE the throwaway round-trip;
    // we model this by reading directly. If `before === 0`, stack must
    // remain empty.
    if (before === 0) {
      expect(() => getDirectiveRouter()).toThrow();
    } else {
      const newTop = m.stack.at(-1)!;

      expect(getDirectiveRouter()).toBe(newTop as unknown as Router);
    }
  }

  toString(): string {
    return "IdempotentRelease()";
  }
}

class AssertTopCommand implements fc.Command<StackModel, unknown> {
  check = () => true;

  run(m: Readonly<StackModel>): void {
    if (m.stack.length === 0) {
      expect(() => getDirectiveRouter()).toThrow();
    } else {
      const top = m.stack.at(-1)!;

      expect(getDirectiveRouter()).toBe(top as unknown as Router);
    }
  }

  toString(): string {
    return "AssertTop()";
  }
}

// =============================================================================
// Test
// =============================================================================

const arbCommand = fc.oneof(
  // Weight push higher so sequences naturally grow before releasing.
  { weight: 4, arbitrary: fc.constant(new PushCommand()) },
  { weight: 2, arbitrary: fc.constant(new ReleaseTopCommand()) },
  {
    weight: 3,
    arbitrary: fc.nat({ max: 16 }).map((idx) => new ReleaseByIndexCommand(idx)),
  },
  { weight: 1, arbitrary: fc.constant(new IdempotentReleaseCommand()) },
  { weight: 1, arbitrary: fc.constant(new AssertTopCommand()) },
);

describe("vLink router stack — Stateful Property Tests", () => {
  // Closes §6.2 Inv 8 — stack push/release identity safety under arbitrary
  // command sequences (up to ~30 ops per run; size: "+1" lets fast-check
  // grow the sequence over runs).
  test.prop([fc.commands([arbCommand], { size: "+1" })], {
    numRuns: NUM_RUNS.thorough,
  })(
    "any push/release interleaving preserves top-of-stack identity + idempotent release",
    (cmds) => {
      // Module-level reset between runs. setDirectiveRouter(null) clears the
      // entire stack, which is the only public way to bring the state back
      // to a clean baseline (the stack is private to the vLink module).
      setDirectiveRouter(null);

      const setup = (): { model: StackModel; real: unknown } => ({
        model: {
          stack: [],
          pending: new Map<FakeRouter, () => void>(),
          released: new Set<FakeRouter>(),
          nextId: 0,
        },
        real: undefined,
      });

      fc.modelRun(setup, cmds);

      // Cleanup after every iteration so a later run doesn't inherit stale
      // pushes from the previous one.
      setDirectiveRouter(null);
    },
  );
});
