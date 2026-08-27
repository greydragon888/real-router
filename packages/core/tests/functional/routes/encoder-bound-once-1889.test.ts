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
 *
 * ⚑ **Half of this issue's subject was superseded one commit later, and the file
 * says so rather than quietly going green.** #1883 coerces the route name ONCE at
 * the pipeline terminal, so at `buildPath` there is no second read left to split:
 * the drift cells that used to discriminate here became unconstructible, and the
 * bind at that site is now UNKILLABLE — measured, restoring its double read adds
 * zero failures across the whole suite. It is kept anyway (it is correct, it is
 * one property read instead of two, and it is the guard if the terminal ever
 * changes), and declared unkillable per this package's mutation conventions
 * rather than silenced.
 *
 * The TWIN in `matchPath` is a different matter and stays live: its `routeName`
 * is `canonical.name`, and a `forwardState` interceptor returns AFTER the
 * terminal's coercion, so a non-string still reaches it. Restoring its double
 * read reds the sweep cell below.
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

  it("buildPath answers at ONE read, so the encoder pair cannot split", () => {
    // What this cell used to assert, and what it measured before #1889: reads
    // `C,C,C,A` type-checked C's encoder and invoked A's. #1889's bind made the
    // pair agree; #1883's terminal coercion then removed the second read
    // entirely, so the drift has nowhere left to land.
    const out = attempt(drifting(["C", "C", "C", "A"]));

    expect(out.reads, "one read, so no later answer exists").toHaveLength(1);
    expect(out.ran, "the encoder is the FIRST read's route").toStrictEqual([
      "C",
    ]);
    expect(out.error).toBe("");
  });

  it("no drift leaks the private field, whichever route it lands on", () => {
    // Measured before #1889: `this[#store].config.encoders[route] is not a
    // function` — a mangled private-field expression handed to the caller,
    // whenever the `typeof` admitted a route WITH an encoder and the invoke
    // found one without. Swept, because the outcome is the invariant and the
    // read position is not.
    const shapes: readonly (readonly string[])[] = [
      ["A", "A", "A", "noenc"],
      ["noenc", "A"],
      ["A", "noenc"],
      ["C", "noenc", "A"],
    ];

    expect(shapes).toHaveLength(4);

    for (const answers of shapes) {
      expect(attempt(drifting(answers)).error).not.toContain("#store");
    }
  });

  it("a route with an encoder costs no more reads than one without", () => {
    // 5 vs 4 before #1889, 4 vs 4 after it, 1 vs 1 after #1883. The cell asserts
    // the RELATION, which is what "the encoder is not a second question" means,
    // rather than a number that two commits in a row have moved.
    expect(attempt(drifting(["A"])).reads).toHaveLength(
      attempt(drifting(["plain"])).reads.length,
    );
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

  it("CONTROL — the residue this file pinned as #1883's is CLOSED", () => {
    // ⚠ This cell used to assert the opposite, deliberately: #1889 could not stop
    // the caller's `encodeParams` from running before a refusal that was already
    // guaranteed, so the residue was pinned so that #1883's fix would red it and
    // its author would update it on purpose. That is exactly what happened —
    // `buildPath` no longer refuses a name it can resolve, so there is no
    // "before the refusal" left.
    const out = attempt(drifting(["A"]));

    expect(out.error, "the door answers about a route that EXISTS").toBe("");
    expect(out.ran).toStrictEqual(["A"]);
  });
});
