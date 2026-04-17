import { useRef } from "preact/hooks";

/**
 * Stabilizes a value reference based on deep equality (order-insensitive JSON).
 * Returns the same reference until the serialized value changes.
 *
 * Falls back to identity comparison when serialization fails (BigInt,
 * circular references, Symbol, function).
 */
/* eslint-disable @eslint-react/refs -- ref pattern: cache stabilized value between renders */
export function useStableValue<T>(value: T): T {
  const stableRef = useRef<T>(value);
  const serializedRef = useRef<string | null>(null);

  let serialized: string | null;

  try {
    serialized = stableSerialize(value);
  } catch {
    if (!Object.is(stableRef.current, value)) {
      stableRef.current = value;
    }

    return stableRef.current;
  }

  if (serialized !== serializedRef.current) {
    stableRef.current = value;
    serializedRef.current = serialized;
  }

  return stableRef.current;
}
/* eslint-enable @eslint-react/refs */

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
