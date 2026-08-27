import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * `buildPath` binds the route's encoder ONCE (#1889).
 *
 * `typeof config.encoders[route] === "function"` and `config.encoders[route](…)`
 * were two reads of the CALLER's argument used as a property key, with a gap
 * between them. Three failure modes, all measured on bare core and all closed by
 * the single bind.
 *
 * ⚠ A STABLE `toString` is VACUOUS here and the issue says so: two reads of a
 * stable bag agree, so such a cell measures nothing. Every cell below drifts.
 */
describe("buildPath binds the encoder once (#1889)", () => {
  const ran: string[] = [];
  const reads: string[] = [];

  const ROUTES = (): Route[] =>
    [
      { name: "plain", path: "/plain/:id" },
      {
        name: "A",
        path: "/a/:id",
        encodeParams: (p: unknown) => {
          ran.push("A");

          return p;
        },
      },
      {
        name: "C",
        path: "/c/:id",
        encodeParams: (p: unknown) => {
          ran.push("C");

          return p;
        },
      },
      { name: "noenc", path: "/n/:id" },
    ] as unknown as Route[];

  /** A name whose `toString` walks `answers`, one entry per read. */
  const drifting = (answers: readonly string[]): string => {
    let n = 0;

    return {
      toString() {
        const out = answers[Math.min(n, answers.length - 1)];

        n += 1;
        reads.push(out);

        return out;
      },
    } as unknown as string;
  };

  const attempt = (
    name: string,
  ): { error: string; ran: string[]; reads: string[] } => {
    const router = createRouter(ROUTES());

    ran.length = 0;
    reads.length = 0;

    try {
      router.buildPath(name, { id: "1" });

      return { error: "", ran: [...ran], reads: [...reads] };
    } catch (error) {
      return {
        error: (error as Error).message,
        ran: [...ran],
        reads: [...reads],
      };
    } finally {
      router.dispose();
    }
  };

  it("type-checks and invokes the SAME route's encoder under a drifting name", () => {
    // Measured before the fix: reads `C,C,C,A` tested C's encoder and ran A's —
    // the `typeof` and the call landed on different routes.
    const out = attempt(drifting(["C", "C", "C", "A"]));

    expect(
      out.ran,
      "the encoder that ran is the one that was type-checked",
    ).toStrictEqual(["C"]);
    expect(out.reads).toStrictEqual(["C", "C", "C", "A"]);
  });

  it("a drift onto a route with NO encoder does not leak the private field", () => {
    // Measured before the fix: `this[#store].config.encoders[route] is not a
    // function` — a mangled private-field expression handed to the caller. The
    // single bind closes this one without a line of its own.
    const out = attempt(drifting(["A", "A", "A", "noenc"]));

    expect(out.error).not.toContain("#store");
    expect(out.error).toContain("'noenc' is not defined");
  });

  it("costs one read fewer when the route declares an encoder", () => {
    // 5 before, 4 after — the pair became a single read.
    expect(attempt(drifting(["A"])).reads).toHaveLength(4);
    // CONTROL: a route WITHOUT an encoder was 4 before and is 4 now, so the row
    // above is a real drop and not a change of how the door counts.
    expect(attempt(drifting(["plain"])).reads).toHaveLength(4);
  });

  it("CONTROL — a string caller is unaffected on both arms", () => {
    const withEncoder = attempt("A");

    expect(withEncoder.error).toBe("");
    expect(withEncoder.ran).toStrictEqual(["A"]);
    expect(withEncoder.reads).toStrictEqual([]);

    const without = attempt("plain");

    expect(without.error).toBe("");
    expect(without.ran).toStrictEqual([]);
  });

  it("the TWIN in matchPath binds it too, at every read position", () => {
    // `matchPath`'s `rewritePathOnMatch` branch carried the identical idiom,
    // keyed by `canonical.name` — which a plugin's `forwardState` interceptor may
    // hand back as a non-string. The discriminating input is a name that names a
    // route WITH an encoder on one read and one WITHOUT on the next: the
    // `typeof` then admits, the invoke then finds `undefined`, and the caller
    // gets `this[#store].config.encoders[routeName] is not a function`.
    //
    // ⚠ Swept across every read position rather than pinned to the one that
    // happened to split (read 3, measured). The position is an implementation
    // detail; "no read position may produce a raw private-field TypeError" is
    // the invariant, and it is what makes this cell survive a refactor that
    // shifts the count.
    //
    // ⚑ Found by sweeping. The first attempt at this cell asserted which encoder
    // RAN, and that mutant survived the entire 4661-test suite — the split it
    // closes is masked by a larger one that survives (see below).
    const flipAt = (n: number): string => {
      let reads = 0;

      return {
        toString() {
          reads += 1;

          return reads <= n ? "A" : "noenc";
        },
      } as unknown as string;
    };

    const outcomes: string[] = [];

    for (let n = 0; n <= 8; n++) {
      const router = createRouter(ROUTES());
      const api = getPluginApi(router);

      api.addInterceptor("forwardState", (next, name, params, search) => {
        const resolved = next(name, params, search);

        return { ...resolved, name: flipAt(n) };
      });

      try {
        const state = api.matchPath("/a/7");

        outcomes.push(state === undefined ? "undefined" : "ok");
      } catch (error) {
        outcomes.push((error as Error).message);
      } finally {
        router.dispose();
      }
    }

    expect(outcomes).toHaveLength(9);
    expect(
      outcomes.filter((o) => o.includes("#store")),
      "no read position may leak the private field",
    ).toStrictEqual([]);
  });

  it("CONTROL — the encoder still runs before the refusal, and that is #1883's", () => {
    // ⚠ Pinning a residue, deliberately. The single bind stops the SPLIT; it does
    // not stop the caller's `encodeParams` from running on the way to a throw
    // that was already guaranteed. Closing that means refusing at the terminal,
    // which is the open question #1883 owns — so this cell reds when #1883 lands
    // and the author is meant to update it, not to be surprised by it.
    const out = attempt(drifting(["A"]));

    expect(out.ran).toStrictEqual(["A"]);
    expect(out.error).toContain("'A' is not defined");
  });
});
