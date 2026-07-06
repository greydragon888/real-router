import { describe, expect, it } from "vitest";

import { createMatcher } from "../helpers/buildTree";

/**
 * #1288 — validated sub-traverse. A branch candidate (splat's specific child,
 * and — part 2 — a param branch at a param+splat junction) commits only when it
 * structurally completes AND its route's constraints hold on the decoded scratch
 * values; otherwise the wildcard/splat sibling captures. Closes the
 * constraint-blind fallback family: a post-traverse constraint failure used to
 * kill the WHOLE match even though the fallback interpretation was valid.
 */
describe("validated sub-traverse — #matchSplat specific child (#24 blind spot)", () => {
  const blob = () =>
    createMatcher([
      {
        name: "blob",
        path: "/files/*any",
        children: [{ name: "kid", path: String.raw`/:id<\d+>` }],
      },
    ]);

  it("a specific child whose constraint HOLDS still wins over the wildcard", () => {
    const r = blob().match("/files/5");

    expect(r?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(r?.params).toStrictEqual({ id: "5" });
  });

  it("a structurally-complete child whose constraint FAILS falls back to the wildcard (was UNMATCH)", () => {
    // buildPath("blob", {any:"xx"}) emits "/files/xx" — before the fix its own
    // match rejected it: the specific branch won structurally, then died in
    // post-traverse constraint validation where no fallback exists.
    const m = blob();

    expect(m.buildPath("blob", { any: "xx" })).toBe("/files/xx");

    const r = m.match("/files/xx");

    expect(r?.segments.at(-1)?.fullName).toBe("blob");
    expect(r?.params).toStrictEqual({ any: "xx" });
  });

  it("validates the branch constraint on the DECODED value (#857)", () => {
    // %35 decodes to "5" — the raw form fails \d+, the decoded form passes.
    const r = blob().match("/files/%35");

    expect(r?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(r?.params).toStrictEqual({ id: "5" });
  });

  it("an undecodable candidate value falls back to the wildcard, then UNMATCHes in decode (#737)", () => {
    // decode("%zz") throws → the specific branch cannot hold → wildcard captures
    // the raw segment → #decodeParams rejects it. Same observable result as
    // before (UNMATCH), reached through the fallback instead of a dead commit.
    const m = blob();

    expect(() => m.match("/files/%zz")).not.toThrow();
    expect(m.match("/files/%zz")).toBeUndefined();
  });

  it("a multi-segment remainder keeps the wildcard capture (structural miss unchanged)", () => {
    expect(blob().match("/files/a/b")?.params).toStrictEqual({ any: "a/b" });
  });

  it("skips a constrained param ABSENT from the branch scratch (omitted optional, #1148)", () => {
    // kid's optional :id<\d+>? is omitted on "/files/tail" — its constraint must
    // not be tested against a missing value inside the candidate check.
    const m = createMatcher([
      {
        name: "blob",
        path: "/files/*any",
        children: [{ name: "kid", path: String.raw`/:id<\d+>?/tail` }],
      },
    ]);

    const omit = m.match("/files/tail");

    expect(omit?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(omit?.params).toStrictEqual({});

    const present = m.match("/files/7/tail");

    expect(present?.params).toStrictEqual({ id: "7" });
  });

  it("under 'none' encoding the branch constraint tests the raw segment", () => {
    const m = createMatcher(
      [
        {
          name: "blob",
          path: "/files/*any",
          children: [{ name: "kid", path: String.raw`/:id<\d+>` }],
        },
      ],
      { urlParamsEncoding: "none" },
    );

    expect(m.match("/files/7")?.segments.at(-1)?.fullName).toBe("blob.kid");
    expect(m.match("/files/xx")?.params).toStrictEqual({ any: "xx" });
  });
});
