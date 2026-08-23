import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getRoutesApi } from "@real-router/core/api";

/**
 * #1839 — `deriveMatcherOptions` handed `urlParamsEncoding` downstream BY
 * REFERENCE, while its four siblings two lines below are derived or snapshotted.
 * `SegmentMatcher`'s constructor coerces that value on every construction, and
 * the matcher is rebuilt on `add` / `remove` / `replace` / `setRootPath` and on
 * `resetStore`, which `dispose()` goes through.
 *
 * So an object-valued encoding re-entered the caller's code once per rebuild,
 * with two faces:
 *
 *   (a) a `toString` that threw on a LATER read threw out of `dispose()` after
 *       `sendDispose()`, leaving a router that still answered `buildPath`;
 *   (b) a `toString` that answered differently gave one router several live
 *       encodings, so URLs built before and after a `routes.add` disagreed.
 *
 * Off-type for a TypeScript consumer — and exactly the population the matcher's
 * own `"default"` fallback exists for: "every value that does reach it came from
 * a JS consumer or a runtime-assembled config".
 */
const ROUTES = [{ name: "x", path: "/x/:v" }];

const attempt = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("urlParamsEncoding is read once, at construction (#1839)", () => {
  it("coerces once per CONSTRUCTION, not once per matcher rebuild", () => {
    // ⚑ "Once per construction", not "once ever" — measured, and the distinction
    // is the whole invariant. `cloneRouter` builds a second router, which reads
    // its own option once, exactly as the first did. What must not happen is a
    // read per matcher REBUILD, and `add` / `remove` / `dispose` all rebuild.
    let reads = 0;
    const encoding = {
      toString: () => {
        reads += 1;

        return "uri";
      },
    };

    const router = createRouter(ROUTES, {
      urlParamsEncoding: encoding,
    } as never);

    expect(reads).toBe(1);

    getRoutesApi(router).add([{ name: "y", path: "/y" }]);
    getRoutesApi(router).remove("y");
    router.dispose();

    expect(reads).toBe(1);
  });

  it("a clone reads its own option once, and only once", () => {
    let reads = 0;
    const encoding = {
      toString: () => {
        reads += 1;

        return "uri";
      },
    };

    const router = createRouter(ROUTES, {
      urlParamsEncoding: encoding,
    } as never);
    const clone = cloneRouter(router);

    expect(reads).toBe(2);

    // Neither router re-reads it afterwards, through any rebuild door.
    getRoutesApi(clone).add([{ name: "y", path: "/y" }]);
    clone.dispose();
    router.dispose();

    expect(reads).toBe(2);
  });

  it("(a) a throwing coercion cannot tear dispose() half-way", () => {
    let reads = 0;
    const encoding = {
      toString: () => {
        reads += 1;

        if (reads > 1) {
          throw new Error("boom on the rebuild");
        }

        return "uri";
      },
    };

    const router = createRouter(ROUTES, {
      urlParamsEncoding: encoding,
    } as never);

    expect(
      attempt(() => {
        router.dispose();
      }),
    ).toBe("ok");

    // A router whose dispose TORE keeps answering, because the throw landed
    // after `sendDispose()` and before the routes were cleared; a clean one
    // refuses.
    //
    // ⚠ On the SHIPPED defect the assertion above fires first — the tear
    // makes `dispose()` itself throw — so this line is not what catches it. It
    // guards the neighbouring shape the first assertion cannot see: a teardown
    // that is torn but SILENT (measured: removing the `dispose()` call inside
    // `attempt` leaves the first assertion green and reds this one). Both are
    // needed; only the pair covers "did not throw" AND "actually tore down".
    expect(attempt(() => router.buildPath("x", { v: "1" }))).toContain(
      "is not defined",
    );
  });

  it("(b) the live encoding does not drift across a rebuild", () => {
    let reads = 0;
    const encoding = {
      toString: () => (reads++ === 0 ? "uri" : "none"),
    };

    const router = createRouter(ROUTES, {
      urlParamsEncoding: encoding,
    } as never);

    const before = router.buildPath("x", { v: "a b" });

    getRoutesApi(router).add([{ name: "z", path: "/z" }]);

    expect(router.buildPath("x", { v: "a b" })).toBe(before);
    expect(before).toBe("/x/a%20b");

    router.dispose();
  });

  it("CONTROL — a first-read throw fails loudly AND names the option", () => {
    const encoding = {
      toString: () => {
        throw new Error("boom at construction");
      },
    };

    // ⛑ Asserting the SHAPE of the failure, not merely that one happened.
    // `String(value)` throwing already aborts the construction on its own, so a
    // cell that checks only "not ok" would pin nothing — deleting the try/catch
    // in `snapshotEncodingKey` reds no OTHER test in the suite, only this one
    // (measured). What the wrap buys is a
    // diagnosis — the raw error reads "boom at construction" and names no
    // option, leaving the reader no way to tell WHICH constructor argument
    // failed. The `cause` is the other half: wrapping must not swallow it.
    let thrown: unknown;

    try {
      createRouter(ROUTES, { urlParamsEncoding: encoding } as never).dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as TypeError).message).toContain("urlParamsEncoding");
    expect((thrown as { cause?: Error }).cause?.message).toBe(
      "boom at construction",
    );
  });

  it("a nullish encoding still lands on the default, and is reachable", () => {
    // ⚑ Not a dead branch — measured. `{ urlParamsEncoding: null }` and
    // `{ … : undefined }` both reach it from JavaScript; only OMITTING the field
    // does not, because the options default fills it first. It answers
    // `"default"` rather than `undefined` because `exactOptionalPropertyTypes`
    // forbids an explicit `undefined` in an optional slot, and because that is
    // what the matcher's own `?? "default"` produced before.
    //
    // ⚠ What this cell does NOT do is pin the arm itself: deleting it leaves
    // the suite green, because `String(null)` is `"null"`, no table owns that
    // key, and the matcher falls back to the same `"default"` (measured). The
    // arm is behaviour-preserving for the URL and is kept for the stored key —
    // see the note in `snapshotEncodingKey`. This cell pins REACHABILITY and the
    // output, and says so rather than implying more.
    let visited = 0;

    for (const value of [null, undefined]) {
      const router = createRouter(ROUTES, {
        urlParamsEncoding: value,
      } as never);

      expect(router.buildPath("x", { v: "a b" })).toBe("/x/a%20b");

      visited += 1;
      router.dispose();
    }

    // Without this the cell passes on an EMPTY loop — nothing else in it would
    // notice if the iteration set were emptied by a careless edit.
    expect(visited).toBe(2);
  });

  it("BOUNDARY — the encoding coercion now preempts the other construction errors", () => {
    // ⛑ Not a guarantee anyone asked for — a RECORD of a change this fix made,
    // so it is visible rather than discovered. Moving the coercion out of
    // `SegmentMatcher` and into `deriveMatcherOptions` moved it ABOVE route
    // registration: before, the matcher was built after the routes were
    // registered, so a config bad in two places reported the OTHER fault first.
    //
    // Nothing is broken either way — construction fails, and the message names
    // a real problem. But the reported error changed for every caller whose
    // config is bad in two places at once, and that belongs in a test rather
    // than in someone's bug report.
    const boom = {
      toString: () => {
        throw new Error("enc boom");
      },
    };
    const dup = [
      { name: "a", path: "/a" },
      { name: "a", path: "/b" },
    ];

    // Each fault ALONE still reports itself — the baseline half, without which
    // the rows below would pass on a router that refuses everything.
    expect(
      attempt(() => {
        createRouter(dup).dispose();
      }),
    ).toContain("Duplicate route");
    expect(
      attempt(() => {
        createRouter(ROUTES, {
          queryParams: { arrayFormat: "bogusTypo" },
        } as never).dispose();
      }),
    ).toContain("queryParams.arrayFormat");

    // Paired with a throwing encoding, the encoding wins in both.
    expect(
      attempt(() => {
        createRouter(dup, { urlParamsEncoding: boom } as never).dispose();
      }),
    ).toContain("urlParamsEncoding");
    expect(
      attempt(() => {
        createRouter(ROUTES, {
          queryParams: { arrayFormat: "bogusTypo" },
          urlParamsEncoding: boom,
        } as never).dispose();
      }),
    ).toContain("urlParamsEncoding");
  });

  it("CONTROL — an ordinary string encoding is unaffected", () => {
    const none = createRouter(ROUTES, { urlParamsEncoding: "none" });

    expect(none.buildPath("x", { v: "a b" })).toBe("/x/a b");

    const uri = createRouter(ROUTES, { urlParamsEncoding: "uri" });

    expect(uri.buildPath("x", { v: "a b" })).toBe("/x/a%20b");

    none.dispose();
    uri.dispose();
  });
});
