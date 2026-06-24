import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

/**
 * State freeze semantics (`freezeStateInPlace`, src/helpers.ts).
 *
 * The observable contract is proven through the PUBLIC pipeline: every committed
 * state from `navigate()` / `getState()` is top-level frozen, its `context` stays
 * writable (so plugins can publish via `claim.write`), and the cached reference is
 * returned unchanged on repeat reads (the already-frozen no-op path). The old
 * white-box "shallow — does not freeze params/meta" assertions are dropped: via
 * navigate, `params` is frozen UPSTREAM by `setState`, and the meta WeakMap store
 * is covered by transitionPath/state tests — neither is observable here.
 *
 * `freezeStateInPlace` runs on every navigation (StateNamespace freezes via it),
 * so it is fully covered here. Its former `!state` guard was redundant cruft
 * (`Object.freeze` returns null/undefined as-is) and has been removed from src —
 * hence no white-box null test remains.
 */
describe("State freeze semantics (via navigate + getState)", () => {
  const make = () =>
    createRouter([
      { name: "home", path: "/" },
      { name: "user", path: "/users/:id" },
    ]);

  it("freezes the committed state's top level (reassignment throws)", async () => {
    const router = make();

    await router.start("/");
    await router.navigate("user", { id: "123" });

    const state = router.getState()!;

    expect(Object.isFrozen(state)).toBe(true);
    expect(() => {
      (state as unknown as { name: string }).name = "modified";
    }).toThrow();
    expect(() => {
      (state as unknown as { path: string }).path = "/new";
    }).toThrow();
  });

  it("leaves state.context unfrozen so plugins can publish via claim.write", async () => {
    const router = make();

    await router.start("/");

    const context = router.getState()!.context as Record<string, unknown>;

    expect(Object.isFrozen(context)).toBe(false);
    expect(() => {
      context.custom = "written by plugin";
    }).not.toThrow();
    expect(context.custom).toBe("written by plugin");
  });

  it("returns the same frozen reference on repeated getState (already-frozen no-op)", async () => {
    const router = make();

    await router.start("/");

    const first = router.getState();
    const second = router.getState();

    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
