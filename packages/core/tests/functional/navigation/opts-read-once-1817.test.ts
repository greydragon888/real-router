import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

import type { Route } from "@real-router/core/types";

/**
 * `executeNavigation` reads each `opts` flag ONCE (#1817, residual of #1719).
 *
 * #1719 hoisted `reload` / `replace` / `redirected` at the entry, on the stated
 * ground that `opts` is accessor- or Proxy-backed BY CONTRACT and every read is a
 * call into application code. Two readers stayed behind:
 *
 *   • `isSameNavigation`, which re-read `opts.reload` (and read `opts.force`) to
 *     decide the `SAME_STATES` short-circuit — so the flag that DECIDED and the
 *     flag that was RECORDED in `state.transition` were two different reads;
 *   • `forceReplaceFromUnknown`, whose predicate read `opts.replace` before the
 *     hoist did.
 *
 * ⚑ The rule these cells encode is the one this family has settled on: a door
 * answers as its FIRST read names.
 */
describe("executeNavigation reads each opts flag once (#1817)", () => {
  const ROUTES = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ] as unknown as Route[];

  /** An `opts` whose named flags answer from a per-key script, one entry per read. */
  const driftingOpts = (
    script: Readonly<Record<string, readonly unknown[]>>,
  ): { opts: object; reads: Record<string, number> } => {
    const reads: Record<string, number> = {};

    for (const key of Object.keys(script)) {
      reads[key] = 0;
    }

    const opts = new Proxy(
      {},
      {
        get(_target, key) {
          if (typeof key !== "string" || !(key in script)) {
            return;
          }

          const answers = script[key];

          reads[key] += 1;

          return answers[Math.min(reads[key] - 1, answers.length - 1)];
        },
        has: (_target, key) => typeof key === "string" && key in script,
        ownKeys: () => Object.keys(script),
        getOwnPropertyDescriptor: () => ({
          enumerable: true,
          configurable: true,
        }),
      },
    );

    return { opts, reads };
  };

  it("a reload requested by the FIRST read is honoured", async () => {
    // Measured before the fix: rejected `SAME_STATES`. The hoist read `true` and
    // built the meta from it; `isSameNavigation` read `false` a moment later and
    // refused. The caller asked for a reload and was silently declined.
    const router = createRouter(ROUTES);

    await router.start("/a");

    const { opts, reads } = driftingOpts({ reload: [true, false] });
    const state = await router.navigate("a", {}, {}, opts as never);

    expect(state.name).toBe("a");
    expect(state.transition?.reload).toBe(true);
    expect(reads.reload, "one read decides and records").toBe(1);

    router.dispose();
  });

  it("a reload DENIED by the first read stays denied", async () => {
    // The mirror, and it used to succeed while recording `reload: false` — the
    // committed `transition` carried the value that did NOT decide.
    const router = createRouter(ROUTES);

    await router.start("/a");

    const { opts, reads } = driftingOpts({ reload: [false, true] });

    await expect(
      router.navigate("a", {}, {}, opts as never),
    ).rejects.toMatchObject({ code: "SAME_STATES" });

    expect(reads.reload).toBe(1);

    router.dispose();
  });

  it("the forced replace out of UNKNOWN_ROUTE is not lost to a second read", async () => {
    // ⚠ Not in the issue's body beyond "read twice", and it is the sharpest of
    // the three: `forceReplaceFromUnknown` exists so a 404 entry does not
    // pollute history. Its predicate saw `true` — "the caller already asked for
    // replace, nothing to substitute" — and the meta then recorded `false`, so a
    // URL plugin reading `transition.replace` pushes where it must replace.
    const router = createRouter(ROUTES, { allowNotFound: true });

    await router.start("/nowhere");

    expect(router.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");

    const { opts, reads } = driftingOpts({ replace: [true, false] });
    const state = await router.navigate("b", {}, {}, opts as never);

    expect(state.transition?.replace).toBe(true);
    expect(reads.replace, "the predicate and the meta share one read").toBe(1);

    router.dispose();
  });

  it("CONTROL — stable opts behave exactly as before, on every arm", async () => {
    const router = createRouter(ROUTES, { allowNotFound: true });

    await router.start("/a");

    const reloaded = await router.navigate("a", {}, {}, { reload: true });

    expect(reloaded.transition?.reload).toBe(true);

    await expect(
      router.navigate("a", {}, {}, { reload: false }),
    ).rejects.toMatchObject({ code: "SAME_STATES" });

    const moved = await router.navigate("b", {}, {}, { replace: true });

    expect(moved.transition?.replace).toBe(true);

    router.dispose();
  });

  it("CONTROL — force short-circuits the same-state check, from one read", async () => {
    // `opts.force` was read ONLY inside `isSameNavigation`, so it has no
    // second read to disagree with — but it moves to the hoist with the others,
    // and this pins that its meaning is unchanged.
    const router = createRouter(ROUTES);

    await router.start("/a");

    const forced = await router.navigate("a", {}, {}, {
      force: true,
    } as never);

    expect(forced.name).toBe("a");

    router.dispose();
  });
});
