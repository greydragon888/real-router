/**
 * Serializes a value into a stable JSON string — object keys are sorted at
 * every level so that `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the same
 * output.
 *
 * Used as a cache key for `createActiveRouteSource` so that equivalent params
 * objects share the same cached source regardless of key order.
 *
 * **Divergence from `shared/dom-utils/scroll-restore.canonicalJson` — by
 * design.** That sibling implementation is the cheap navigation-hot-path
 * variant (uses `localeCompare`, plain-object accumulator, native cycle
 * detector) and pairs with `safeKeyOf` for crash-tolerance. This one is the
 * strict cache-key variant: byte-order compare, prototype-less accumulator,
 * bespoke cycle detection — eagerly throws on inputs that would cause
 * collisions or pollution, so callers can fall back to non-cached sources.
 * They are NOT interchangeable; cross-package equivalence is explicitly not
 * a goal (audit-2 / audit-2026-05-17 §2).
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
 * - Circular references throw `TypeError` (parity with native `JSON.stringify`).
 *   The replacer copies each object level into a fresh prototype-less record,
 *   so we must run our own cycle detection — the native detector never sees
 *   the original object graph.
 * - `__proto__` keys are preserved as own properties (no prototype pollution
 *   and no silent collision between `{ __proto__: x, b: 1 }` and `{ b: 1 }`).
 *
 * In practice, route params carry primitives (`string | number | boolean`);
 * the cache-key-collision edge cases above are defensive bugs caught loudly.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set<object>()));
}

// Key comparison uses byte-order (`<` / `>`) instead of `localeCompare()` so
// the output is independent of the Node.js ICU build / system locale. Same
// canonical form on every machine — required for cache-key stability.
function compareKeys(left: string, right: string): number {
  return left < right ? -1 : 1;
}

/**
 * Returns a structural clone with object keys sorted at every level. Path-based
 * cycle detection (`path` set) matches the semantics of native `JSON.stringify`
 * — a `TypeError` is thrown on a true cycle, but the same object reachable via
 * two independent branches (DAG) serialises fine.
 *
 * `Date` instances pass through unchanged so `JSON.stringify` can invoke their
 * `toJSON` hook. Other built-ins (`Map`, `Set`, `WeakMap`, `WeakSet`, `RegExp`)
 * throw eagerly to avoid silent cache-key collisions.
 */
function canonicalize(value: unknown, path: Set<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof RegExp
  ) {
    throw new TypeError(
      `canonicalJson: cannot serialize ${(value as { constructor: { name: string } }).constructor.name} — non-enumerable own keys collapse to "{}" and would cause cache-key collisions. Pass primitive params (string | number | boolean) instead.`,
    );
  }

  if (path.has(value)) {
    throw new TypeError(
      "canonicalJson: cannot serialize circular structure (cycle detected during traversal).",
    );
  }

  path.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => canonicalize(item, path));
    }

    // Use a null-prototype record so `__proto__` is treated as a regular
    // own property — assigning to a plain `{}` would set the prototype
    // chain instead and silently collide with inputs that omit the key.
    const sorted: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    const keys = Object.keys(value as Record<string, unknown>).toSorted(
      compareKeys,
    );

    for (const key of keys) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key], path);
    }

    return sorted;
  } finally {
    path.delete(value);
  }
}
