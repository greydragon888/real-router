import { runInNewContext } from "node:vm";

import { describe, expect, expectTypeOf, it } from "vitest";

import { adoptChannel } from "@real-router/core/utils";

import { countingBag, driftingBag } from "../helpers/hostileBags";

/**
 * `adoptChannel` published: judge the caller's SHAPE, copy its VALUES (#2187).
 *
 * ⚑ **The published half of the ingestion rule, and the half with no cells of
 * its own.** `putField` and `copyFields` own the WRITE side and are pinned here;
 * ADOPT is reachable only through the doors that call it, so nothing states what
 * it answers for a given shape.
 *
 * ⚠ **The rule is `Object.prototype` BY IDENTITY, not "looks like a bag".** The
 * dangerous half of the table is therefore the rows that DO look like one and
 * still come back by reference — a swapped prototype carries no own key to give
 * itself away, and another realm's plain object carries none either. A copy of
 * such a value would hand the layer below an acceptable object built out of one
 * it refuses; returned unchanged it arrives as the caller wrote it, and a
 * consumer without a validating door below it has to refuse it rather than
 * write to it.
 */
/** Bag-SHAPED: the two prototypes the rule accepts, and it accepts no others. */
const COPIED_SHAPES: readonly (readonly [string, object])[] = [
  ["a plain object", { id: "1" }],
  ["a null-prototype bag", Object.assign(Object.create(null), { id: "1" })],
];

/** The row that must COPY — without it every cell below passes for a predicate
 * that never copies anything. Named, because the assertion keys on it. */
const PLAIN_CONTROL = "a JSON.parse result (CONTROL — plain, so it copies)";

/** Not `Object.prototype` by identity — the last two look like bags anyway. */
const REFERENCE_SHAPES_PLUS_CONTROL: readonly (readonly [string, object])[] = [
  [
    "a class instance",
    new (class Point {
      readonly x = 1;
    })(),
  ],
  ["a Date", new Date(0)],
  ["an array", ["a"]],
  [PLAIN_CONTROL, JSON.parse('{"id":"1"}') as object],
  [
    "a prototype-swapped literal",
    Object.setPrototypeOf({ id: "1" }, { inherited: "1" }) as object,
  ],
  ["another realm's plain object", runInNewContext('({ id: "1" })') as object],
];

/** Both spellings of "no bag". */
const ABSENT_SPELLINGS: readonly (readonly [string, undefined | null])[] = [
  ["undefined", undefined],
  ["null", null],
];

describe("adoptChannel — published adopt rule (#2187)", () => {
  it("CONTROL — every table below registers the cells it claims to", () => {
    // `it.each([])` registers no cells in silence, so the counts live outside
    // the `each` (`table-vacuity-authority` owns that convention).
    expect(COPIED_SHAPES).toHaveLength(2);
    expect(REFERENCE_SHAPES_PLUS_CONTROL).toHaveLength(6);
    expect(ABSENT_SPELLINGS).toHaveLength(2);
  });

  it.each(COPIED_SHAPES)("copies %s, preserving its content", (_label, bag) => {
    const out = adoptChannel(bag as Record<string, unknown>);

    expect(out).not.toBe(bag);
    expect(out).toStrictEqual({ id: "1" });
  });

  it.each(REFERENCE_SHAPES_PLUS_CONTROL)(
    "decides %s by prototype identity, not by how bag-like it looks",
    (label, value) => {
      const out = adoptChannel(value as Record<string, unknown>);

      expect(out === value).toBe(label !== PLAIN_CONTROL);
    },
  );

  it.each(ABSENT_SPELLINGS)(
    "answers %s with itself — the arm a pre-M2 entry relies on",
    (_label, value) => {
      const out = adoptChannel(value);

      expect(out).toBe(value);
    },
  );

  it("types every spelling it admits, absence included", () => {
    // The reason the signature is ONE generic rather than an overload set, as a
    // cell: a sentence about inference goes stale silently, and the `null` arm
    // is reachable from `history.state` — documented and uncallable from
    // TypeScript is the state this replaced. Asserted on the SIGNATURE, so
    // re-introducing overloads reds this even if each of them happens to answer.
    expectTypeOf(adoptChannel).toEqualTypeOf<
      <T extends Record<string, unknown> | undefined | null>(bag: T) => T
    >();

    const bag = { id: "1" };

    expect(adoptChannel(bag)).toStrictEqual(bag);
  });

  it("reads each key ONCE, and commits the value of that read", () => {
    // The reason the copy exists: the guard walks the caller's object and the
    // commit walks it again, so a key that answers twice is admitted on one
    // value and shipped on the other.
    const drifting = driftingBag({ id: "first" }, { id: "drifted" });
    const adopted = adoptChannel(drifting.bag as Record<string, unknown>);

    expect(adopted).toStrictEqual({ id: "first" });

    const counted = countingBag({ id: "1", page: "2" });

    adoptChannel(counted.bag as Record<string, unknown>);

    expect(counted.reads).toStrictEqual({ id: 1, page: 1 });
  });
});
