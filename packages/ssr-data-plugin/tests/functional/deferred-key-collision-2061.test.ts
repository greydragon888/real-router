import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRegistryForTests,
  ensureRegistryPromise,
} from "../../src/shared-ssr/deferRegistryClient";

/**
 * A deferred key claimed by two routers on one page says so (#2061).
 *
 * ⚑ **The key namespace belongs to the APPLICATION, not to the plugin.**
 * `defer({ deferred: { reviews } })` puts `"reviews"` on `globalThis` for the
 * whole document, so two independently-authored mounts that both pick a generic
 * name share one registry entry — and therefore one promise OBJECT. Whichever
 * payload the server streams first resolves it for both, and the second
 * router's `useDeferred()` reads the first one's data with nothing to show for
 * it.
 *
 * ⚠ **What ships here is a DIAGNOSTIC, not isolation, and that is the decision
 * rather than a shortcut.** Handing the second claimant its own promise would be
 * worse than the collision: the settle script carries the bare key and resolves
 * exactly one entry, so the second promise would never settle at all. Real
 * isolation needs a per-router prefix in the WIRE format, which needs an
 * identity surviving SSR → client that `SerializedRouterState` does not carry.
 *
 * ⚠ **Idempotency is the property this must not break.** One router asking for
 * the same key twice is the documented case `useDeferred` depends on — React
 * `use()` tracks resolution by promise reference — and it must stay silent.
 */
const ROUTER_A: object = { router: "a" };
const ROUTER_B: object = { router: "b" };

describe("a deferred key claimed twice on one page (#2061)", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetRegistryForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    __resetRegistryForTests();
  });

  it("stays silent when ONE claimant asks repeatedly, and returns one promise", () => {
    const first = ensureRegistryPromise("reviews", ROUTER_A);
    const second = ensureRegistryPromise("reviews", ROUTER_A);

    expect(second).toBe(first);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a SECOND claimant asks for the same key", () => {
    void ensureRegistryPromise("reviews", ROUTER_A);
    void ensureRegistryPromise("reviews", ROUTER_B);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('Deferred key "reviews"');
  });

  it("still hands the second claimant the SAME promise — a diagnostic, not a split", () => {
    // The load-bearing half of the decision: a separate promise for the second
    // claimant would never settle, because the settle script carries the bare
    // key and resolves one entry.
    const a = ensureRegistryPromise("reviews", ROUTER_A);
    const b = ensureRegistryPromise("reviews", ROUTER_B);

    expect(b).toBe(a);
  });

  it("reports once per KEY, not once per render", () => {
    void ensureRegistryPromise("reviews", ROUTER_A);
    void ensureRegistryPromise("reviews", ROUTER_B);
    void ensureRegistryPromise("reviews", ROUTER_B);
    void ensureRegistryPromise("reviews", ROUTER_A);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reports each colliding key separately", () => {
    void ensureRegistryPromise("reviews", ROUTER_A);
    void ensureRegistryPromise("related", ROUTER_A);
    void ensureRegistryPromise("reviews", ROUTER_B);
    void ensureRegistryPromise("related", ROUTER_B);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("the de-dup flag dies with the registry, not with the process", () => {
    // ⚠ A module-level `Set` here would be the #1583 shape: process-global
    // de-dup goes silent after the first router under SSR/SSG, which for a
    // diagnostic is exactly backwards. The flag lives on the entry, so a fresh
    // registry reports again.
    void ensureRegistryPromise("reviews", ROUTER_A);
    void ensureRegistryPromise("reviews", ROUTER_B);
    __resetRegistryForTests();
    void ensureRegistryPromise("reviews", ROUTER_A);
    void ensureRegistryPromise("reviews", ROUTER_B);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the caller supplies no claimant", () => {
    // The parameter is optional, so a consumer calling the re-exported helper
    // directly keeps the old behaviour rather than being told off for it.
    void ensureRegistryPromise("reviews");
    void ensureRegistryPromise("reviews");

    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing when the FIRST claim carried no claimant", () => {
    // Nothing to compare against — an unclaimed entry cannot say whose it is,
    // and guessing would report a collision that may not exist.
    void ensureRegistryPromise("reviews");
    void ensureRegistryPromise("reviews", ROUTER_B);

    expect(warn).not.toHaveBeenCalled();
  });
});
