/**
 * Search Params - Query String Parsing and Building.
 *
 * Internalized from https://github.com/troch/search-params (MIT License)
 * for better code control and optimization.
 *
 * @module search-params/searchParams
 */

import { decode, decodeValue } from "./decode";
import { encode, makeOptions } from "./encode";

import type { ResolvedStrategies } from "./strategies";
import type { Options } from "./types";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Assigns a parameter as an own data property.
 *
 * Plain `params[name] = value` invokes the inherited `__proto__` accessor for the
 * literal key `"__proto__"`, so that key would mutate the prototype instead of
 * becoming a real entry; `defineProperty` writes a genuine own property.
 *
 * @internal
 */
function assignParam(
  params: Record<string, unknown>,
  name: string,
  value: unknown,
): void {
  if (name === "__proto__") {
    Object.defineProperty(params, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    params[name] = value;
  }
}

/**
 * Adds a decoded value to params object, handling array accumulation.
 *
 * Collisions are detected via `Object.hasOwn`, not `params[name] !== undefined`:
 * a query key that shadows an `Object.prototype` member (`valueOf`, `constructor`,
 * `toString`, …) would otherwise read the inherited function and be mistaken for
 * a pre-existing value, corrupting the result into `[<fn>, value]`. (#855)
 *
 * @internal
 */
function addToParams(
  params: Record<string, unknown>,
  decodedName: string,
  decodedValue: unknown,
  hasBrackets: boolean,
): void {
  if (!Object.hasOwn(params, decodedName)) {
    assignParam(
      params,
      decodedName,
      hasBrackets ? [decodedValue] : decodedValue,
    );

    return;
  }

  const currentValue = params[decodedName];

  if (Array.isArray(currentValue)) {
    currentValue.push(decodedValue);
  } else {
    assignParam(params, decodedName, [currentValue, decodedValue]);
  }
}

/**
 * Decodes a parameter value through the resolved strategies.
 *
 * @internal
 */
function decodeParamValue(
  searchPart: string,
  eqPos: number,
  end: number,
  hasValue: boolean,
  strategies: ResolvedStrategies,
): unknown {
  const rawValue = hasValue ? searchPart.slice(eqPos + 1, end) : undefined;

  return decode(rawValue, strategies);
}

/**
 * Reads the non-negative integer index from a bracketed name (`a[12]`).
 *
 * `open` points at the `[`; digits up to the matching `]` form the index. Returns
 * `null` for `[]`, non-digit content (`a[x]`), or a missing `]` — those fall back
 * to insertion-order accumulation. (#856)
 *
 * @internal
 */
function bracketIndex(
  searchPart: string,
  open: number,
  limit: number,
): number | null {
  let i = open + 1;
  let value = 0;
  let hasDigit = false;

  while (i < limit) {
    const ch = searchPart.codePointAt(i);

    if (ch === 93) {
      // ']' — a numeric index only if at least one digit preceded it ("[]" → null)
      return hasDigit ? value : null;
    }

    if (ch !== undefined && ch >= 48 && ch <= 57) {
      value = value * 10 + (ch - 48);
      hasDigit = true;
      i++;

      continue;
    }

    return null; // non-digit inside brackets — not a numeric index
  }

  return null; // no closing ']' (incl. "[" at end) — malformed, fall back
}

/**
 * A single parsed query chunk: the source string plus the boundary offsets and
 * decoded name that `processParamChunk` computes once. Bundled into one
 * descriptor so the indexed-format collector reuses them without a long
 * parameter list (#856).
 *
 * @internal
 */
interface ParsedChunk {
  searchPart: string;
  /** Offset of `[` (bracket notation), or the name terminator. */
  nameEnd: number;
  /** Offset where the raw name ends (`=` for valued chunks, else `end`). */
  nameSourceEnd: number;
  /** Offset of `=`, or -1 when the chunk has no value. */
  eqPos: number;
  /** Offset one past the chunk. */
  end: number;
  hasValue: boolean;
  decodedName: string;
}

/**
 * Collects a bracketed chunk into the index-format group, to be sorted by index
 * after the full pass. Returns `false` when the bracket is not a numeric index
 * (`a[]`, `a[x]`, `a[`), so the caller falls back to insertion-order push. (#856)
 *
 * @internal
 */
function collectIndexedChunk(
  chunk: ParsedChunk,
  strategies: ResolvedStrategies,
  indexedGroups: Map<string, [number, unknown][]>,
): boolean {
  const {
    searchPart,
    nameEnd,
    nameSourceEnd,
    eqPos,
    end,
    hasValue,
    decodedName,
  } = chunk;
  const index = bracketIndex(searchPart, nameEnd, nameSourceEnd);

  if (index === null) {
    return false;
  }

  const value = decodeParamValue(searchPart, eqPos, end, hasValue, strategies);
  const group = indexedGroups.get(decodedName);

  if (group === undefined) {
    indexedGroups.set(decodedName, [[index, value]]);
  } else {
    group.push([index, value]);
  }

  // Stryker disable next-line BooleanLiteral: equivalent — returning false makes the caller ALSO push via insertion order, but indexedGroups was already populated above and parseIntoInternal overwrites the key with the index-sorted result, so the final params are identical (proven by injection).
  return true;
}

/**
 * Processes a single query parameter chunk and adds to params.
 *
 * `indexedGroups` is supplied only for `arrayFormat: "index"`: bracketed chunks
 * with a numeric index are collected there (to be sorted by index after the full
 * pass) instead of pushed in insertion order. (#856)
 *
 * @internal
 */
function processParamChunk(
  searchPart: string,
  start: number,
  end: number,
  params: Record<string, unknown>,
  strategies: ResolvedStrategies,
  eqPos: number,
  indexedGroups?: Map<string, [number, unknown][]>,
): void {
  // `eqPos` is the position of the next `=` at or after `start`, resolved once by
  // the caller's monotonic cursor (#1316) — never re-scanned here. `eqPos < end`
  // means it falls inside THIS chunk (so the chunk has a value); otherwise the
  // chunk is key-only.
  const hasValue = eqPos !== -1 && eqPos < end;

  const nameSourceEnd = hasValue ? eqPos : end;
  let nameEnd = nameSourceEnd;
  let hasBrackets = false;

  for (let i = start; i < nameSourceEnd; i++) {
    if (searchPart.codePointAt(i) !== 91) {
      continue;
    }

    // '['
    nameEnd = i;
    hasBrackets = true;

    break;
  }

  const decodedName = decodeValue(searchPart.slice(start, nameEnd));

  // Index array format: order by the bracket index, not insertion. A non-numeric
  // bracket (`a[]`, `a[x]`) returns false → falls through to insertion-order push.
  if (
    indexedGroups !== undefined &&
    hasBrackets &&
    collectIndexedChunk(
      { searchPart, nameEnd, nameSourceEnd, eqPos, end, hasValue, decodedName },
      strategies,
      indexedGroups,
    )
  ) {
    return;
  }

  // Comma array decode: split raw value before individual element decoding
  if (!hasBrackets && hasValue && strategies.array.decodeValue) {
    const rawValue = searchPart.slice(eqPos + 1, end);
    const parts = strategies.array.decodeValue(rawValue);

    if (parts) {
      for (const part of parts) {
        addToParams(params, decodedName, decode(part, strategies), true);
      }

      return;
    }
  }

  const decodedValue = decodeParamValue(
    searchPart,
    eqPos,
    end,
    hasValue,
    strategies,
  );

  addToParams(params, decodedName, decodedValue, hasBrackets);
}

// =============================================================================
// Parse
// =============================================================================

/**
 * Parse an ALREADY-EXTRACTED query string (no path prefix, no leading "?") into
 * an object of parameters.
 *
 * The input must already be split at the first "?" — `SegmentMatcher.#preparePath`
 * does this before the DI call, so route-tree wires `parseQuery` (not a
 * path-accepting wrapper) as its query parser: re-splitting the input here would
 * break at a "?" *inside* a query value (legal per RFC 3986), silently dropping
 * the param (and unmatching the whole URL under `strictQueryParams`). (#1292)
 *
 * @example
 * ```typescript
 * parseQuery("page=1&sort=name");
 * // => { page: 1, sort: "name" }
 *
 * parseQuery("items[]=a&items[]=b", { arrayFormat: "brackets" });
 * // => { items: ["a", "b"] }
 * ```
 */
export const parseQuery = (
  search: string,
  opts?: Options,
): Record<string, unknown> => {
  // Fast path: empty query string
  if (search === "" || search === "?") {
    return {};
  }

  // makeOptions(undefined) returns the cached DEFAULT_OPTIONS (auto) — the same
  // defaults `build` uses — so parseQuery(build(x)) === x even without options. (#744)
  const params: Record<string, unknown> = {};

  parseIntoInternal(search, params, makeOptions(opts).strategies);

  return params;
};

/**
 * Internal function to parse a query string into a target object.
 * The shared parse engine behind `parseQuery`.
 *
 * @internal
 */
function parseIntoInternal(
  searchPart: string,
  params: Record<string, unknown>,
  strategies: ResolvedStrategies,
): void {
  // `index` format orders by the bracket index; collect (index, value) pairs and
  // sort after the pass. `undefined` for every other format (no overhead). (#856)
  const indexedGroups = strategies.array.indexed
    ? new Map<string, [number, unknown][]>()
    : undefined;

  let start = 0;
  const length = searchPart.length;

  // Monotonic cursor for the next `=`. Its position only ever moves forward with
  // `start`, so the whole parse does a single amortised O(n) scan for `=` —
  // replacing `processParamChunk`'s former per-chunk `indexOf("=", start)`, which
  // scanned to the end of the string on every key-only chunk and made `parse`
  // O(n²) on `"a&a&…"` (#1316). `-2` = not yet searched; `-1` = no `=` remains.
  let eqCache = -2;

  while (start < length) {
    let end = searchPart.indexOf("&", start);

    if (end === -1) {
      end = length;
    }

    // Skip empty chunks — a `&&`, a leading `&`, or a trailing `&` produces a
    // zero-length span that carries no name and no value. Processing it would
    // decode the empty name to `""` and the missing value to `null`, injecting a
    // junk `{ "": null }` param (and `[null, …]` on repeats) (#1156). An
    // intentional empty-key chunk always carries an `=` (`"=1"` → `end > start`),
    // so it is unaffected.
    if (end > start) {
      // Advance the cursor only when the cached `=` is behind the current chunk;
      // once it reports `-1` (no `=` left in the string) it is final.
      if (eqCache !== -1 && eqCache < start) {
        eqCache = searchPart.indexOf("=", start);
      }

      processParamChunk(
        searchPart,
        start,
        end,
        params,
        strategies,
        eqCache,
        indexedGroups,
      );
    }

    start = end + 1;
  }

  if (indexedGroups !== undefined) {
    for (const [name, pairs] of indexedGroups) {
      // Stable sort by index (V8 sort is stable) → equal indices keep arrival order.
      pairs.sort((left, right) => left[0] - right[0]);
      assignParam(
        params,
        name,
        pairs.map((pair) => pair[1]),
      );
    }
  }
}

// =============================================================================
// Build
// =============================================================================

/**
 * Build a querystring from an object of parameters.
 *
 * Note: Empty arrays produce an empty string, so `parseQuery(build({ items: [] }))`
 * will not contain the `items` key. This is expected behavior for all array
 * formats including `comma` — the key is erased uniformly (INVARIANTS #9).
 *
 * @example
 * ```typescript
 * build({ page: 1, sort: "name" });
 * // => "page=1&sort=name"
 *
 * build({ items: ["a", "b"] }, { arrayFormat: "brackets" });
 * // => "items[]=a&items[]=b"
 * ```
 */
export const build = (
  params: Record<string, unknown>,
  opts?: Options,
): string => {
  // Fast path for empty params (common case)
  const keys = Object.keys(params);

  if (keys.length === 0) {
    return "";
  }

  const options = makeOptions(opts);

  // Optimized: single loop instead of filter().map().filter().join()
  // Avoids creating 3 intermediate arrays
  const parts: string[] = [];

  for (const key of keys) {
    const value = params[key];

    // Skip undefined values (not serialisable)
    if (value === undefined) {
      continue;
    }

    const encoded = encode(key, value, options);

    // Skip empty strings (e.g., from nullFormat: "hidden")
    if (encoded) {
      parts.push(encoded);
    }
  }

  return parts.join("&");
};
