// packages/react/src/hooks/useStableValue.tsx

import { useRef } from "react";

/**
 * Stabilizes a value reference based on deep equality (order-insensitive JSON).
 * Returns the same reference until the serialized value changes.
 *
 * Uses ref-based pattern: serialize once, store result, compare on next call.
 * Falls back to identity comparison if value cannot be serialized
 * (BigInt, circular references, Symbol, function).
 *
 * @example
 * ```tsx
 * const stableParams = useStableValue(routeParams);
 * const href = useMemo(() => {
 *   return router.buildUrl(routeName, stableParams);
 * }, [router, routeName, stableParams]);
 * ```
 *
 * @param value - The value to stabilize
 * @returns A stable reference to the value
 */
export function useStableValue<T>(value: T): T {
  const stableRef = useRef<T>(value);
  const serializedRef = useRef<string | null>(null);

  let serialized: string | null;

  try {
    serialized = stableSerialize(value);
  } catch {
    // eslint-disable-next-line @eslint-react/refs -- ref pattern: identity fallback when serialization fails
    if (!Object.is(stableRef.current, value)) {
      // eslint-disable-next-line @eslint-react/refs -- ref pattern: identity fallback when serialization fails
      stableRef.current = value;
    }

    // eslint-disable-next-line @eslint-react/refs -- ref pattern: return cached identity
    return stableRef.current;
  }

  // eslint-disable-next-line @eslint-react/refs -- ref pattern: compare against cached serialized form
  if (serialized !== serializedRef.current) {
    // eslint-disable-next-line @eslint-react/refs -- ref pattern: cache new value when serialized form changed
    stableRef.current = value;
    // eslint-disable-next-line @eslint-react/refs -- ref pattern: cache serialized form alongside value
    serializedRef.current = serialized;
  }

  // eslint-disable-next-line @eslint-react/refs -- ref pattern: return stable cached value
  return stableRef.current;
}

/**
 * Order-insensitive JSON serialization. Recursively sorts plain-object keys
 * so `{a:1,b:2}` and `{b:2,a:1}` produce identical output.
 *
 * Throws on BigInt / circular references — caller must handle.
 *
 * @internal
 */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (
      val === null ||
      typeof val !== "object" ||
      Array.isArray(val) ||
      Object.getPrototypeOf(val) !== Object.prototype
    ) {
      return val;
    }

    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).toSorted((lhs, rhs) =>
      lhs.localeCompare(rhs),
    );
    const sorted: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      sorted[key] = obj[key];
    }

    return sorted;
  });
}
