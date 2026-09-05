import { describe, expect, it } from "vitest";

import { copyFields } from "@real-router/core/utils";

import { driftingBag } from "../helpers/hostileBags";

/**
 * `copyFields` reads each source key ONCE (#2115).
 *
 * ⚠ **This is the one property of the ingestion primitive that had no cell.**
 * #1901's gate mutated all four in turn: removing the `Object.create(null)`
 * target, the define-over-inherited write or the publishing spread reds cells
 * there — removing the single read reds NOTHING. The facet it closes,
 * read-N-times, is the largest in that issue's own table.
 *
 * ⚑ **The assertion is which value LANDS, not how many reads happened.** A
 * count-only cell stays green for a form that reads once and reads the wrong
 * once; the count is here as corroboration, below the outcome. `read-count`
 * cells elsewhere in this tree audit the DOORS that read caller slots — none of
 * them reaches the primitive those doors would ingest through.
 *
 * ⚠ **Two mutations, and the second is why this file says what it says.** The
 * historical form of the defect is ask-then-take (#1899) — `if (source[key] !==
 * undefined) putField(target, key, source[key])` — which reads three times and
 * commits the drifted value. The form that looks equivalent and is NOT a
 * mutation at all is `Object.keys(source)` plus indexing: `keys` never invokes a
 * getter, so that walk reads exactly as many times as `Object.entries` does. It
 * was tried twice, printed green twice, and was almost reported as a vacuous
 * cell. A cell here must red on the first and stay green on the second.
 */
describe("copyFields reads each key once (#2115)", () => {
  it("commits the FIRST value a drifting accessor answers, not the second", () => {
    const source = driftingBag(
      { id: "first", page: "first" },
      { id: "drifted", page: "drifted" },
    );
    const target: Record<string, string> = {};

    copyFields(target, source.bag);

    expect(target).toStrictEqual({ id: "first", page: "first" });
  });

  it("and the count corroborates it — one read per key, not two", () => {
    const source = driftingBag({ id: "first", page: "first" }, {});
    const target: Record<string, string> = {};

    copyFields(target, source.bag);

    expect(source.reads).toStrictEqual({ id: 1, page: 1 });
  });

  it("CONTROL — the bag really does drift, so a green above is a property of the walk", () => {
    // ⚑ Without this the two cells above pass on a bag that answers the same
    // value twice, which is the shape `countingBag` builds and this one must
    // not be.
    const source = driftingBag({ id: "first" }, { id: "drifted" });
    const bag = source.bag as Record<string, string>;

    expect(bag.id).toBe("first");
    expect(bag.id).toBe("drifted");
    expect(source.reads.id).toBe(2);
  });

  it("CONTROL — an ordinary bag still copies, so the walk is not refusing accessors", () => {
    const target: Record<string, string> = {};

    copyFields(target, { id: "1", page: "2" });

    expect(target).toStrictEqual({ id: "1", page: "2" });
  });
});
