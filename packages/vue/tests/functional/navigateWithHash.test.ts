import { describe, it, expect } from "vitest";

import { navigateWithHash } from "../../src/dom-utils";

import type {
  NavigationOptions,
  Params,
  Router,
  State,
} from "@real-router/core";

// Review §5.3 — direct functional tests for the shared `navigateWithHash`
// helper consumed by every Vue Link click handler. The #532 feature is the
// auto-bypass of core's SAME_STATES check when a user clicks a hash-bearing
// Link targeting the current route+params but a *different* fragment.
//
// We hand-roll a fake router rather than instantiating @real-router/core +
// browser-plugin, because the helper only touches `getState()` and
// `navigate()` — the rest of the router contract is irrelevant here and a
// hand-rolled fake makes the test's surface area exactly the behavior under
// test.

type HashAwareOpts = NavigationOptions & {
  hash?: string;
  hashChange?: boolean;
};

interface FakeCurrent {
  name: string;
  params: Params;
  /** When `undefined`, the context has no `url` namespace (memory-plugin shape). */
  hash: string | undefined;
  /** When true, context is `{}` (no `url` at all). When false, `url` is `{}` (no `hash`). */
  contextHasNoUrl?: boolean;
}

interface RecordedCall {
  name: string;
  params: Params;
  opts: HashAwareOpts;
}

function makeFakeRouter(current: FakeCurrent | undefined): {
  router: Router;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  const router = {
    getState: () => {
      if (current === undefined) {
        return;
      }

      let context: Record<string, unknown>;

      if (current.contextHasNoUrl) {
        context = {};
      } else if (current.hash === undefined) {
        // Memory-plugin shape: context.url exists but lacks `hash`.
        context = { url: {} };
      } else {
        context = { url: { hash: current.hash } };
      }

      return {
        name: current.name,
        params: current.params,
        context,
      } as unknown as State;
    },
    navigate: (
      name: string,
      params: Params,
      _search: unknown,
      opts?: HashAwareOpts,
    ) => {
      // Slot-shift (RFC-4 M2 / #1548): navigateWithHash passes the query channel
      // at position 3 (unused here) and opts at position 4.
      calls.push({ name, params, opts: opts ?? {} });

      return Promise.resolve({ name, params } as unknown as State);
    },
  } as unknown as Router;

  return { router, calls };
}

describe("navigateWithHash — feature #532 auto-bypass", () => {
  it("same route + same params + DIFFERENT hash → auto-adds force:true and hashChange:true", async () => {
    // This is the headline behavior of #532. Without the auto-bypass core's
    // SAME_STATES check would reject the navigation because the route key is
    // unchanged from the consumer's perspective; the hash difference alone
    // is invisible to the FSM.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: "profile",
    });

    await navigateWithHash(router, "settings", {}, undefined, "account");

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.hash).toBe("account");
    expect(calls[0].opts.force).toBe(true);
    expect(calls[0].opts.hashChange).toBe(true);
  });

  it("same route + same params + SAME hash → passthrough (no force, no hashChange)", async () => {
    // The auto-bypass only fires on *change*. Re-clicking the same hash Link
    // must not silently inject force:true — that would defeat the dedup.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: "profile",
    });

    await navigateWithHash(router, "settings", {}, undefined, "profile");

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.hash).toBe("profile");
    expect(calls[0].opts.force).toBeUndefined();
    expect(calls[0].opts.hashChange).toBeUndefined();
  });

  it("DIFFERENT route + different hash → no auto-bypass (force/hashChange absent)", async () => {
    // The bypass logic only kicks in when name + params shallow-equal the
    // current state. Cross-route navigation passes through unchanged.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: "profile",
    });

    await navigateWithHash(router, "users", {}, undefined, "section");

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("users");
    expect(calls[0].opts.hash).toBe("section");
    expect(calls[0].opts.force).toBeUndefined();
    expect(calls[0].opts.hashChange).toBeUndefined();
  });

  it("memory-plugin mode (`context.url` missing entirely) — defaults currentHash to '' and still auto-bypasses on a new hash", async () => {
    // Review §5.3: the `?? ""` fallback for `context.url.hash`. When the
    // router runs under memory-plugin there is no `url` namespace at all;
    // we expect the helper to treat the current hash as the empty string
    // and to compare against the requested hash.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: undefined,
      contextHasNoUrl: true,
    });

    // Requested hash "section" != "" → trigger bypass.
    await navigateWithHash(router, "settings", {}, undefined, "section");

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.force).toBe(true);
    expect(calls[0].opts.hashChange).toBe(true);
  });

  it("memory-plugin mode + hash:'' → no bypass (currentHash '' === newHash '')", async () => {
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: undefined,
      contextHasNoUrl: true,
    });

    await navigateWithHash(router, "settings", {}, undefined, "");

    expect(calls).toHaveLength(1);
    // hash="" is still set on opts (the helper records every defined hash).
    expect(calls[0].opts.hash).toBe("");
    expect(calls[0].opts.force).toBeUndefined();
    expect(calls[0].opts.hashChange).toBeUndefined();
  });

  it("context present but `context.url` is `{}` (no hash key) — same `?? ''` fallback", async () => {
    // Variant of the memory-plugin shape: `url` namespace exists but the
    // hash sub-key is absent (some plugins set up `url` lazily). Same
    // fallback semantics.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: undefined,
      contextHasNoUrl: false,
    });

    await navigateWithHash(router, "settings", {}, undefined, "section");

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.force).toBe(true);
    expect(calls[0].opts.hashChange).toBe(true);
  });

  it("getState() returns undefined (router not started) → straight passthrough, no bypass logic, hash forwarded", async () => {
    const { router, calls } = makeFakeRouter(undefined);

    await navigateWithHash(router, "settings", {}, undefined, "section");

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.hash).toBe("section");
    expect(calls[0].opts.force).toBeUndefined();
    expect(calls[0].opts.hashChange).toBeUndefined();
  });

  it("hash === undefined → `opts.hash` key is NOT set (preserve-current-hash path)", async () => {
    // `<Link hash={undefined}>` is the documented "preserve current hash"
    // contract from #532. The helper must not stamp `hash: undefined` onto
    // the navigation options (which would be an explicit clear in some
    // plugins) — the key is simply absent.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: "profile",
    });

    await navigateWithHash(router, "settings", {}, undefined, undefined);

    expect(calls).toHaveLength(1);
    expect("hash" in calls[0].opts).toBe(false);
    // current==new ("profile" === "profile" via fallback) → no bypass.
    expect(calls[0].opts.force).toBeUndefined();
    expect(calls[0].opts.hashChange).toBeUndefined();
  });

  it("preserves extraOptions while spreading them into a fresh object (no mutation of caller's options)", async () => {
    // Defensive contract: the helper must not mutate the caller's
    // extraOptions. Pin via identity check.
    const { router, calls } = makeFakeRouter({
      name: "settings",
      params: {},
      hash: "profile",
    });
    const extraOptions: NavigationOptions = { replace: true };

    await navigateWithHash(
      router,
      "settings",
      {},
      undefined,
      "account",
      extraOptions,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.replace).toBe(true);
    expect(calls[0].opts.force).toBe(true);
    expect(calls[0].opts.hashChange).toBe(true);
    // Helper must spread; caller's object is unchanged.
    expect(extraOptions).toStrictEqual({ replace: true });
    expect(calls[0].opts).not.toBe(extraOptions);
  });

  // Review §5.3 — behaviour lock for the documented OVERWRITE RISK on
  // extraOptions.{hash, force, hashChange}. The helper deliberately
  // overwrites these three keys to enforce its same-route auto-bypass
  // contract. Callers cannot opt out by pre-setting them.
  describe("extraOptions overwrite — behaviour lock (review §5.3)", () => {
    it("`hash` positional arg overrides `extraOptions.hash` (positional wins)", async () => {
      const { router, calls } = makeFakeRouter({
        name: "settings",
        params: {},
        hash: "profile",
      });
      const extraOptions = { hash: "from-extra" } as NavigationOptions;

      await navigateWithHash(
        router,
        "settings",
        {},
        undefined,
        "from-arg",
        extraOptions,
      );

      expect(calls).toHaveLength(1);
      // Positional `hash` arg ("from-arg") overwrites `extraOptions.hash`.
      expect(calls[0].opts.hash).toBe("from-arg");
    });

    it("auto-bypass overwrites `extraOptions.force=false` with `true` on same-route different-hash", async () => {
      const { router, calls } = makeFakeRouter({
        name: "settings",
        params: {},
        hash: "profile",
      });
      // Caller explicitly opts out of force; helper still flips it back to true.
      const extraOptions = { force: false } as NavigationOptions;

      await navigateWithHash(
        router,
        "settings",
        {},
        undefined,
        "account",
        extraOptions,
      );

      expect(calls).toHaveLength(1);
      // Helper's auto-bypass takes precedence over the caller's `force: false`.
      expect(calls[0].opts.force).toBe(true);
      expect(calls[0].opts.hashChange).toBe(true);
    });

    it("auto-bypass overwrites `extraOptions.hashChange=false` with `true`", async () => {
      const { router, calls } = makeFakeRouter({
        name: "settings",
        params: {},
        hash: "profile",
      });
      const extraOptions = { hashChange: false } as HashAwareOpts;

      await navigateWithHash(
        router,
        "settings",
        {},
        undefined,
        "account",
        extraOptions,
      );

      expect(calls).toHaveLength(1);
      // Same overwrite contract — caller's `hashChange: false` is silently flipped.
      expect(calls[0].opts.hashChange).toBe(true);
    });

    it("non-bypass path preserves `extraOptions.force` (only auto-bypass writes the key)", async () => {
      // When the bypass branch does NOT fire (same hash, OR different route),
      // the helper never writes `opts.force` — so a caller-supplied value
      // survives. Locks the conditional-write contract.
      const { router, calls } = makeFakeRouter({
        name: "settings",
        params: {},
        hash: "profile",
      });
      const extraOptions = { force: false } as NavigationOptions;

      // Same hash → no bypass → no overwrite of `force`.
      await navigateWithHash(
        router,
        "settings",
        {},
        undefined,
        "profile",
        extraOptions,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].opts.force).toBe(false);
      expect(calls[0].opts.hashChange).toBeUndefined();
    });
  });
});
