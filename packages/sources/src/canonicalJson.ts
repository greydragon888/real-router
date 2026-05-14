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
 * - `Date` is serialized via its `toJSON` method (ISO string).
 * - `Symbol` becomes `undefined` (standard JSON behaviour).
 * - `BigInt` throws via `JSON.stringify` defaults.
 * - `Map`, `Set`, `RegExp`, `WeakMap`, `WeakSet` would silently collapse to
 *   `"{}"` (no enumerable own keys), which would cause **different inputs to
 *   share the same cache key**. We detect these explicitly and throw — callers
 *   then take the non-cached fallback path (same behaviour as `BigInt`).
 *
 * In practice, route params carry primitives (`string | number | boolean`);
 * the cache-key-collision edge cases above are defensive bugs caught loudly.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replacer);
}

// Key comparison uses byte-order (`<` / `>`) instead of `localeCompare()` so
// the output is independent of the Node.js ICU build / system locale. Same
// canonical form on every machine — required for cache-key stability.
function compareKeys(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function replacer(_key: string, val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    if (
      val instanceof Map ||
      val instanceof Set ||
      val instanceof WeakMap ||
      val instanceof WeakSet ||
      val instanceof RegExp
    ) {
      throw new TypeError(
        `canonicalJson: cannot serialize ${val.constructor.name} — non-enumerable own keys collapse to "{}" and would cause cache-key collisions. Pass primitive params (string | number | boolean) instead.`,
      );
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).toSorted(
      compareKeys,
    );

    for (const key of keys) {
      sorted[key] = (val as Record<string, unknown>)[key];
    }

    return sorted;
  }

  return val;
}
