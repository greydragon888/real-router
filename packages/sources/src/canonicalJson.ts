/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectKeys = Object.keys;
const getPrototypeOf = Object.getPrototypeOf;
const dateGetTime = Date.prototype.getTime;

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2072). */
const objectCreate = Object.create;

/**
 * Serializes a params or search bag into a stable cache key: the bag's own keys
 * are sorted, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same output.
 *
 * Used as a cache key for `createActiveRouteSource`, so two bags share a
 * cached source only when `@real-router/core` compares them equal: each value
 * is spelled as core compares it (#2905).
 *
 * Edge cases:
 * - A plain object inside the bag keeps its own key order: core compares it by
 *   `JSON.stringify`, which spells `{ a, b }` and `{ b, a }` apart.
 * - An array is read by index, as core compares it, and keeps its order.
 * - `undefined` values are dropped (standard JSON behaviour).
 * - A `Date` that is a value, or an element of an array value, is spelled by
 *   its `getTime()`, apart from every string, because core never equates a
 *   `Date` with a string there. Inside a plain object it is its `toJSON` ISO
 *   string, as `JSON.stringify` spells it for core.
 * - A function, a symbol, a number that is not finite, and `undefined` in an
 *   array value throw: JSON drops them or spells them `null`.
 * - `BigInt` throws via `JSON.stringify` defaults.
 * - Any other object that is not a plain one or an array throws: a `Map`, a
 *   `Set`, a `RegExp`, a class instance, a `Temporal` value, a `URL`. JSON would
 *   spell it by its own enumerable fields, or as `"{}"`, while core compares it
 *   by its `toString` or by identity.
 * - Circular references throw `TypeError` (parity with native `JSON.stringify`).
 *   The replacer copies each object level into a fresh prototype-less record,
 *   so we must run our own cycle detection — the native detector never sees
 *   the original object graph.
 * - `__proto__` keys are preserved as own properties (no prototype pollution
 *   and no silent collision between `{ __proto__: x, b: 1 }` and `{ b: 1 }`).
 *
 * A throw sends the caller to its non-cached fallback path. Only a plain
 * object whose single key is `"\u0000Date"` shares a `Date`'s spelling, which
 * is unsupported.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set<object>(), "root"));
}

/**
 * Where a value sits, which decides how it is spelled: `root` is the bag, whose
 * keys are sorted; `value` is a value of the bag or an element of an array
 * value, which core compares one by one; `field` is inside a plain object,
 * which core compares by `JSON.stringify`.
 */
type Level = "root" | "value" | "field";

/** An object JSON spells by its own enumerable keys: a plain one or an array. */
function isSpelledByKeys(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  const proto: unknown = getPrototypeOf(value);

  return proto === null || proto === Object.prototype;
}

// Key comparison uses byte-order (`<` / `>`) instead of `localeCompare()` so
// the output is independent of the Node.js ICU build / system locale. Same
// canonical form on every machine — required for cache-key stability.
function compareKeys(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function unspelled(what: string): TypeError {
  return new TypeError(
    `canonicalJson: cannot serialize ${what} — JSON drops it or spells it null, so two values core tells apart would share one cache key.`,
  );
}

/** A `Date` outside a plain object: by its time, in a record no string spells. */
function spellDate(value: Date): Record<string, unknown> {
  const record = objectCreate(null) as Record<string, unknown>;

  record["\u0000Date"] = dateGetTime.call(value);

  return record;
}

/** A value that is not an object, as JSON spells it. */
function spelledScalar(value: unknown): unknown {
  if (typeof value === "function" || typeof value === "symbol") {
    throw unspelled(`a ${typeof value}`);
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw unspelled(String(value));
  }

  return value;
}

/** The refusal of an object the key is not built from. */
function refusedObject(value: object): TypeError {
  const kind = (value as { constructor?: { name?: unknown } }).constructor
    ?.name;

  return new TypeError(
    `canonicalJson: cannot serialize ${typeof kind === "string" && kind !== "" ? kind : "an object"} — a cache-key is built only from plain objects, arrays, Dates and JSON values: core compares any other object by its toString or by identity, not by its fields.`,
  );
}

/**
 * Returns a structural clone with the root's keys sorted. Path-based cycle
 * detection (`path` set) matches the semantics of native `JSON.stringify` — a
 * `TypeError` is thrown on a true cycle, but the same object reachable via two
 * independent branches (DAG) serialises fine.
 *
 * A `Date` inside a plain object passes through unchanged, so `JSON.stringify`
 * can invoke its `toJSON` hook. Any other object that is not a plain one or an
 * array throws eagerly, for the reason the module docblock gives.
 */
function canonicalize(
  value: unknown,
  path: Set<object>,
  level: Level,
): unknown {
  if (typeof value !== "object" || value === null) {
    return spelledScalar(value);
  }

  if (value instanceof Date) {
    return level === "field" ? value : spellDate(value);
  }

  if (!isSpelledByKeys(value)) {
    throw refusedObject(value);
  }

  if (path.has(value)) {
    throw new TypeError(
      "canonicalJson: cannot serialize circular structure (cycle detected during traversal).",
    );
  }

  path.add(value);
  try {
    if (Array.isArray(value)) {
      return canonicalizeArray(
        value,
        path,
        level === "field" ? "field" : "value",
      );
    }

    return canonicalizeRecord(value as Record<string, unknown>, path, level);
  } finally {
    path.delete(value);
  }
}

/**
 * A plain object's own keys, sorted at the root only. A null-prototype record
 * treats `__proto__` as a regular own property — assigning to a plain `{}`
 * would set the prototype chain instead and silently collide with inputs that
 * omit the key.
 */
function canonicalizeRecord(
  value: Readonly<Record<string, unknown>>,
  path: Set<object>,
  level: Level,
): Record<string, unknown> {
  const record = objectCreate(null) as Record<string, unknown>;
  const keys =
    level === "root"
      ? objectKeys(value).toSorted(compareKeys)
      : objectKeys(value);
  const inner = level === "root" ? "value" : "field";

  for (const key of keys) {
    // `record` has no prototype chain and never leaves `canonicalJson` — the
    // exemption the rule names, which its pattern does not recognise here.
    // nosemgrep: unguarded-computed-key-write
    record[key] = canonicalize(value[key], path, inner);
  }

  return record;
}

/**
 * An array's elements, each at the given level. JSON spells `undefined` in an
 * array as `null`, which core keeps apart from it in an array value.
 */
function canonicalizeArray(
  value: readonly unknown[],
  path: Set<object>,
  level: Level,
): unknown[] {
  // One read of the length, and each element by index: an own iterator is not
  // what core walks.
  const { length } = value;
  const elements: unknown[] = [];

  for (let index = 0; index < length; index++) {
    const element = value[index];

    if (element === undefined && level === "value") {
      throw unspelled("undefined in an array");
    }

    elements[index] = canonicalize(element, path, level);
  }

  return elements;
}
