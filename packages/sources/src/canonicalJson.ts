/**
 * Serializes a value into a stable JSON string — object keys are sorted at
 * every level so that `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same
 * output.
 *
 * Used as a cache key for `createActiveRouteSource` so that equivalent params
 * objects share the same cached source regardless of key order.
 *
 * Edge cases:
 * - Arrays preserve order (canonical: index-ordered already).
 * - `undefined` values are dropped (standard JSON behaviour).
 * - `Symbol`, `BigInt`, `Date`, `Map`, `Set` etc. fall through to
 *   `JSON.stringify` defaults — `Symbol` becomes `undefined`, `BigInt` throws.
 *   In practice, route params carry primitives (`string | number | boolean`)
 *   and such edge cases would hit a fresh source on cache miss — acceptable.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replacer);
}

function replacer(_key: string, val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).toSorted(
      (left, right) => left.localeCompare(right),
    );

    for (const key of keys) {
      sorted[key] = (val as Record<string, unknown>)[key];
    }

    return sorted;
  }

  return val;
}
