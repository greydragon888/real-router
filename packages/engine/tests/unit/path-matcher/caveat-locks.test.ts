import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

/**
 * Locks for the two documented INVARIANTS caveats (#1241). These pin ACCEPTED
 * (imperfect) behaviour — not bugs — so a future change that silently alters the
 * documented aliasing / corruption is caught at the test layer, and the caveat
 * text stays honest. See `INVARIANTS.md` Matching #2 and Roundtrip Extensions #2.
 */

describe("INVARIANTS Matching #2 — build-side optional aliasing (caveat-lock)", () => {
  it("a later optional's value binds under the EARLIER omitted optional's name", () => {
    const m = createMatcher([{ name: "r", path: "/a/:b?/:c?/d" }]);

    // Only the LATER optional (`c`) is supplied — `b` omitted.
    const url = m.buildPath("r", { c: "x" });

    expect(url).toBe("/a/x/d");
    // The value comes back under `b`, NOT `c`: the first optional wins the single
    // filled slot. Supply optionals contiguously to round-trip by name.
    expect(m.match(url)?.params).toStrictEqual({ b: "x" });
  });
});

describe("INVARIANTS Roundtrip #2 — silent value corruption under uri/none (caveat-lock)", () => {
  const versioned = (encoding: "uri" | "none") =>
    createMatcher([{ name: "r", path: "/users/:id" }], {
      urlParamsEncoding: encoding,
    });

  it.each(["uri", "none"] as const)(
    "[%s] a '?' in a value silently SPLITS into a query param",
    (encoding) => {
      const m = versioned(encoding);
      const url = m.buildPath("r", { id: "x?tab=1" });

      expect(url).toBe("/users/x?tab=1");
      expect(m.match(url)?.params).toStrictEqual({ id: "x", tab: "1" });
    },
  );

  it.each(["uri", "none"] as const)(
    "[%s] a '#' in a value silently TRUNCATES at the fragment",
    (encoding) => {
      const m = versioned(encoding);
      const url = m.buildPath("r", { id: "x#sec" });

      expect(url).toBe("/users/x#sec");
      expect(m.match(url)?.params).toStrictEqual({ id: "x" });
    },
  );

  it("[none] a non-ASCII value builds an unmatchable URL", () => {
    const m = versioned("none");
    const url = m.buildPath("r", { id: "café" });

    expect(url).toBe("/users/café");
    expect(m.match(url)).toBeUndefined();
  });
});

describe("L2 build (#1324) — trailing '?' on an optional param + empty query (caveat-lock)", () => {
  it("buildPath drops the spurious trailing '?' of `/:a??`", () => {
    // `/:a??` = optional param `a` followed by a lone `?` (an empty query
    // separator). Migrating `compileBuildParts` off `paramRgx` onto the shared
    // `parseSegment` tokenizer (#1324) reconstructs the build template from the
    // tokenized segments and drops that spurious trailing `?` — so `buildPath`
    // emits `/v0`, not the pre-migration `/v0?`. This is the ONLY whole-path shape
    // whose `buildPath` differs from the old regex build (verified by enumeration).
    // Benign — both forms round-trip (the empty `?` is stripped at match) and `/v0`
    // is arguably the cleaner output. Pinned so the change stays intentional, not a
    // latent off-by-one.
    const m = createMatcher([{ name: "r", path: "/:a??" }]);

    const url = m.buildPath("r", { a: "v0" });

    expect(url).toBe("/v0"); // was "/v0?" under the old paramRgx build

    // Both the new and the pre-migration URL round-trip to the same params.
    expect(m.match("/v0")?.params).toStrictEqual({ a: "v0" });
    expect(m.match("/v0?")?.params).toStrictEqual({ a: "v0" });
  });
});
