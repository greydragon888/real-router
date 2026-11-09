import { runInNewContext } from "node:vm";

import { describe, it, expect, vi } from "vitest";

import { canonicalJson } from "../../src/canonicalJson";

/** A value class that keeps its state in a `#private` field. */
class Slug {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  toString(): string {
    return this.#text;
  }
}

/** A class instance whose state is its own enumerable fields. */
class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

/** A class instance with an own field and a `toString` of its own. */
class Label {
  constructor(readonly text: string) {}

  toString(): string {
    return this.text;
  }
}

/** The refusal of an object other than a plain one, an array or a Date. */
const refusal = (kind: string): string =>
  `canonicalJson: cannot serialize ${kind} — a cache-key is built only from plain objects, arrays, Dates and JSON values: core compares any other object by its toString or by identity, not by its fields.`;

/** The refusal of a value JSON drops or spells `null`. */
const unspelled = (what: string): string =>
  `canonicalJson: cannot serialize ${what} — JSON drops it or spells it null, so two values core tells apart would share one cache key.`;

/** `[label, the value the refusal names, a bag holding it]` (#2905). */
const UNSPELLED: [string, string, () => unknown][] = [
  ["a function value", "a function", () => ({ v: () => 1 })],
  ["a function field", "a function", () => ({ v: { f: () => 1 } })],
  ["a symbol value", "a symbol", () => ({ v: Symbol("s") })],
  ["a symbol in an array", "a symbol", () => ({ v: [Symbol("s")] })],
  ["NaN", "NaN", () => ({ v: Number.NaN })],
  ["Infinity in a field", "Infinity", () => ({ v: { n: Infinity } })],
  ["-Infinity in an array", "-Infinity", () => ({ v: [-Infinity] })],
  [
    "undefined in an array value",
    "undefined in an array",
    () => ({ v: [1, undefined] }),
  ],
  [
    "a hole in an array value",
    "undefined in an array",
    () => {
      const holed: unknown[] = [1];

      holed[2] = 2;

      return { v: holed };
    },
  ],
];

/** `[label, the kind the refusal names, a fresh instance]`. */
const REFUSED: [string, string, () => object][] = [
  [
    "a Temporal.PlainDate",
    "PlainDate",
    () => Temporal.PlainDate.from("2024-03-15"),
  ],
  ["a URL", "URL", () => new URL("https://example.test/a")],
  ["a class holding only #private fields", "Slug", () => new Slug("a")],
  [
    "a class instance holding its state in own fields",
    "Point",
    () => new Point(1, 2),
  ],
  [
    "a class with an own field and a toString of its own",
    "Label",
    () => new Label("a"),
  ],
  [
    "an object whose prototype names no constructor",
    "an object",
    () => Object.create(Object.create(null) as object) as object,
  ],
  [
    "a plain object from another realm",
    "Object",
    () => runInNewContext("({ status: 'active' })") as object,
  ],
  [
    "an instance of a class whose name is empty",
    "an object",
    () =>
      new (class {
        readonly v = 1;
      })(),
  ],
];

describe("canonicalJson", () => {
  it("returns the same string for key-reordered objects", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("keeps the key order of an object inside the bag: core compares it by JSON.stringify (#2905)", () => {
    expect(canonicalJson({ outer: { b: 2, a: 1 }, inner: 0 })).toBe(
      '{"inner":0,"outer":{"b":2,"a":1}}',
    );
    expect(canonicalJson({ outer: { a: 1, b: 2 } })).not.toBe(
      canonicalJson({ outer: { b: 2, a: 1 } }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJson([3, 2, 1])).toBe("[3,2,1]");
  });

  it("reads an array by index, as core compares it, not by its own iterator (#2905)", () => {
    const iterated = (elements: number[]): number[] =>
      Object.assign(elements, {
        *[Symbol.iterator]() {
          yield 9;
        },
      });

    expect(canonicalJson({ v: iterated([1, 2]) })).toBe('{"v":[1,2]}');
    expect(canonicalJson({ v: iterated([3, 4]) })).toBe('{"v":[3,4]}');
  });

  it("returns valid JSON for primitives", () => {
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hello")).toBe('"hello"');
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
  });

  it("handles undefined as JSON.stringify does", () => {
    expect(canonicalJson(undefined)).toBeUndefined();
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("produces different strings for different nested values", () => {
    expect(canonicalJson({ a: { x: 1 } })).not.toBe(
      canonicalJson({ a: { x: 2 } }),
    );
  });

  it("keeps the key order of an object inside an array (#2905)", () => {
    expect(canonicalJson({ v: [{ b: 2, a: 1 }, { c: 3 }] })).toBe(
      '{"v":[{"b":2,"a":1},{"c":3}]}',
    );
  });

  it("spells a Date value by its time, apart from its ISO string (#2905)", () => {
    const iso = "1970-01-02T00:00:00.000Z";

    expect(canonicalJson({ d: new Date(iso) })).toBe(
      String.raw`{"d":{"\u0000Date":86400000}}`,
    );
    expect(canonicalJson({ d: new Date(iso) })).not.toBe(
      canonicalJson({ d: iso }),
    );
    expect(canonicalJson({ d: [new Date(iso)] })).not.toBe(
      canonicalJson({ d: [iso] }),
    );
  });

  it("spells a Date by its time while Date.prototype.getTime is re-pointed, as core compares it (#2905)", () => {
    const getTime = vi.spyOn(Date.prototype, "getTime").mockReturnValue(0);

    try {
      expect(canonicalJson({ d: new Date(86_400_000) })).toBe(
        String.raw`{"d":{"\u0000Date":86400000}}`,
      );
    } finally {
      getTime.mockRestore();
    }
  });

  it("spells a Date inside a plain object as JSON does, which is how core compares it (#2905)", () => {
    const iso = "1970-01-02T00:00:00.000Z";

    expect(canonicalJson({ v: { d: new Date(iso) } })).toBe(
      canonicalJson({ v: { d: iso } }),
    );
    expect(canonicalJson({ v: { d: [new Date(iso)] } })).toBe(
      canonicalJson({ v: { d: [iso] } }),
    );
  });

  it("spells undefined inside a plain object's array as JSON does (#2905)", () => {
    expect(canonicalJson({ v: { a: [undefined] } })).toBe('{"v":{"a":[null]}}');
  });

  it("registers every row of the unspelled table", () => {
    expect(UNSPELLED).toHaveLength(9);
  });

  it.each(UNSPELLED)(
    "throws on %s: JSON drops it or spells it null (#2905)",
    (_label, what, bag) => {
      expect(() => canonicalJson(bag())).toThrow(
        new TypeError(unspelled(what)),
      );
    },
  );

  describe("non-serializable object types (audit §5.B)", () => {
    it("throws on Map (would collapse to {} and collide on cache key)", () => {
      expect(() => canonicalJson({ a: new Map([["k", "v"]]) })).toThrow(
        TypeError,
      );
    });

    it("throws on Set (same collision risk as Map)", () => {
      expect(() => canonicalJson({ a: new Set([1, 2, 3]) })).toThrow(TypeError);
    });

    it("throws on RegExp", () => {
      expect(() => canonicalJson({ a: /pattern/ })).toThrow(TypeError);
    });

    it("throws on WeakMap and WeakSet", () => {
      expect(() => canonicalJson({ a: new WeakMap() })).toThrow(TypeError);
      expect(() => canonicalJson({ a: new WeakSet() })).toThrow(TypeError);
    });

    it("error message names the offending constructor", () => {
      expect(() => canonicalJson({ a: new Map() })).toThrow(/Map/);
      expect(() => canonicalJson({ a: new Map() })).toThrow(/cache-key/);
    });

    it("registers every row of its tables", () => {
      expect(REFUSED).toHaveLength(8);
    });

    it.each(REFUSED)(
      "throws on an object other than a plain one, an array or a Date, naming its kind: %s (#2905)",
      (_, kind, make) => {
        const serialize = (): string => canonicalJson({ a: make() });

        expect(serialize).toThrow(TypeError);
        expect(serialize).toThrow(refusal(kind));
      },
    );

    it("an empty plain object, an empty null-prototype object and an empty array still serialize (#2905)", () => {
      expect(
        canonicalJson({ a: {}, b: Object.create(null) as object, c: [] }),
      ).toBe('{"a":{},"b":{},"c":[]}');
    });

    it("a Date is fine — inside a plain object JSON.stringify invokes Date.toJSON (ISO string)", () => {
      const result = canonicalJson({
        a: { at: new Date("2026-05-14T00:00:00.000Z") },
      });

      expect(result).toBe('{"a":{"at":"2026-05-14T00:00:00.000Z"}}');
    });
  });

  describe("__proto__ key safety (audit §5.A — no prototype-pollution / no collision)", () => {
    it("treats __proto__ as a regular own property — different from an object without it", () => {
      // Plain { } assignment would set the prototype chain, leaving the
      // serialised form indistinguishable from the keyless object and silently
      // colliding on cache keys. Object.create(null) preserves the key.
      const withProto = Object.fromEntries([
        ["__proto__", 1],
        ["b", 2],
      ]);

      expect(canonicalJson(withProto)).not.toBe(canonicalJson({ b: 2 }));
      expect(canonicalJson(withProto)).toBe('{"__proto__":1,"b":2}');
    });

    it("preserves nested __proto__ keys", () => {
      const nested = {
        outer: Object.fromEntries([
          ["__proto__", "x"],
          ["a", 1],
        ]),
      };

      expect(canonicalJson(nested)).toBe('{"outer":{"__proto__":"x","a":1}}');
    });
  });

  describe("cycle detection (audit §5.B — TypeError on circular, DAG passes)", () => {
    it("throws TypeError on a direct self-cycle (parity with native JSON.stringify)", () => {
      const cyclic: Record<string, unknown> = {};

      cyclic.self = cyclic;

      expect(() => canonicalJson(cyclic)).toThrow(TypeError);
      expect(() => canonicalJson(cyclic)).toThrow(/circular/);
    });

    it("throws TypeError on an indirect cycle through an intermediate object", () => {
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = { a };

      a.b = b;

      expect(() => canonicalJson(a)).toThrow(TypeError);
    });

    it("does NOT throw on a shared (DAG) reference reachable via two branches", () => {
      const shared = { x: 1 };
      const dag = { left: shared, right: shared };

      // Same object reachable through `left` and `right` is not a cycle — it's
      // a DAG. Native JSON.stringify serialises it twice; canonicalJson must
      // mirror that semantics so non-cyclic param graphs are cacheable.
      expect(canonicalJson(dag)).toBe('{"left":{"x":1},"right":{"x":1}}');
    });

    it("does NOT throw on an array containing the same object twice", () => {
      const shared = { v: 1 };

      expect(canonicalJson([shared, shared])).toBe('[{"v":1},{"v":1}]');
    });
  });

  describe("byte-order key comparison (audit §5.C — no localeCompare dependency)", () => {
    it("ASCII keys are sorted by code-point, not locale rules", () => {
      // Under locale-aware comparison, "A" and "a" can sort differently
      // depending on ICU build. Byte-order makes the output deterministic.
      const result = canonicalJson({ a: 1, A: 2, b: 3, B: 4 });

      expect(result).toBe('{"A":2,"B":4,"a":1,"b":3}');
    });

    it("repeated calls return identical output (deterministic)", () => {
      const obj = { z: 1, a: 2, m: 3, b: 4 };
      const first = canonicalJson(obj);

      for (let i = 0; i < 100; i++) {
        expect(canonicalJson(obj)).toBe(first);
      }
    });
  });

  // ===========================================================================
  // Audit 2026-05-16 §5 — small edge inputs (LOW). Property tests already cover
  // the breadth of these cases (canonicalJson.properties.ts edge-values pin,
  // deep nesting tolerance, locale independence) — the unit tests below pin
  // the documented contract for fast hand-rerun & doc-quality regression.
  // ===========================================================================

  describe("small edge inputs (audit §5 — pin documented contract)", () => {
    it('empty object → "{}"', () => {
      expect(canonicalJson({})).toBe("{}");
    });

    it('empty array → "[]"', () => {
      expect(canonicalJson([])).toBe("[]");
    });

    it("BigInt at top level → TypeError", () => {
      expect(() => canonicalJson(1n)).toThrow(TypeError);
    });

    it("BigInt nested in object → TypeError", () => {
      expect(() => canonicalJson({ id: 1n })).toThrow(TypeError);
    });

    it("a Symbol value throws, and a Symbol KEY is invisible to Object.keys (#2905)", () => {
      const sym = Symbol("k");

      expect(() => canonicalJson({ a: sym, b: 1 })).toThrow(
        new TypeError(unspelled("a symbol")),
      );
      expect(canonicalJson({ a: 1, [sym]: 2 })).toBe('{"a":1}');
    });

    it("string keys that LOOK numeric are still sorted by byte order (when not integer-like)", () => {
      // V8 reorders integer-like own keys ahead of string keys regardless of
      // insertion order (ECMA-262 OrdinaryOwnPropertyKeys), so a key like "10"
      // would round-trip in numeric order even on a null-prototype object.
      // Prefix with "a" to keep them string-like — then byte-order sort wins:
      // "a1" < "a10" < "a2" (because '1' (0x31) < '2' (0x32)).
      const result = canonicalJson({ a10: 1, a2: 2, a1: 3 });

      expect(result).toBe('{"a1":3,"a10":1,"a2":2}');
    });

    it("(documented JS-engine quirk) integer-like keys reorder ahead of byte-order sort", () => {
      // Object.keys on a null-prototype record with integer-like own keys
      // returns them in numeric ascending order, regardless of insertion
      // sequence. This is a V8/spec invariant; canonicalJson's byte-order
      // compareKeys runs against an already-numeric-ordered array, so the
      // wire output mirrors that ordering. We pin it to flag any future
      // workaround (e.g., wrapping keys to defeat the integer-key path).
      const result = canonicalJson({ "10": 1, "2": 2, "1": 3 });

      // Numeric ordering: "1" → "2" → "10".
      expect(result).toBe('{"1":3,"2":2,"10":1}');
    });

    it("non-ASCII unicode keys sort by code point (locale-independent)", () => {
      // 'α' (U+03B1) < 'β' (U+03B2). ICU collation could reorder these in
      // certain locales; the byte-order comparator must not depend on locale.
      const result = canonicalJson({ β: 1, α: 2 });

      expect(result).toBe('{"α":2,"β":1}');
    });

    it("NaN / ±Infinity throw rather than collapse to `null` (#2905)", () => {
      expect(() => canonicalJson({ x: Number.NaN })).toThrow(
        new TypeError(unspelled("NaN")),
      );
      expect(() => canonicalJson({ x: Number.POSITIVE_INFINITY })).toThrow(
        new TypeError(unspelled("Infinity")),
      );
      expect(() => canonicalJson({ x: Number.NEGATIVE_INFINITY })).toThrow(
        new TypeError(unspelled("-Infinity")),
      );
    });

    it("-0 collides with +0 (JSON.stringify behaviour)", () => {
      expect(canonicalJson({ x: -0 })).toBe(canonicalJson({ x: 0 }));
      expect(canonicalJson(-0)).toBe(canonicalJson(0));
    });

    it("deep nesting (100 levels) terminates without RangeError", () => {
      let value: unknown = 1;

      for (let i = 0; i < 100; i++) {
        value = { w: value };
      }

      expect(() => canonicalJson(value)).not.toThrow();

      // 100 wrapping objects → 100 opening braces in the output.
      const result = canonicalJson(value);

      expect(result.split("{").length - 1).toBe(100);
    });
  });
});
