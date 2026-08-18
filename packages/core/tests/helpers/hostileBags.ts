/**
 * The adversarial input battery for caller-supplied bags.
 *
 * ⚑ **This exists because it did not.** Every shape below found a real defect in
 * the #1798 / #1796 / #1811 run — and each was constructed ad hoc, in a scratch
 * file, and thrown away. The battery was re-derived three times and run AFTER
 * each commit, which is why three of that run's four code defects reached a
 * commit before anything noticed. Committed here so it runs before one instead.
 *
 * The rule these shapes probe: **an object the caller owns is application code.**
 * Core's own documentation states it for `opts` — *"accessor- or Proxy-backed by
 * contract, so every read is a call into application code, and a second read may
 * answer differently"* — and the same holds for `params`, `search`, `queryParams`,
 * `options`, `dependencies` and every route config. A door that reads such an
 * object twice can admit a key on one value and use another; a door that copies
 * it with a spread silently drops what the caller put on the prototype.
 *
 * ⚠ **Name-agnostic, deliberately.** Nothing here enumerates field names. A
 * battery that took a field list would be one more hand-written copy of a list
 * some module already owns — the shape that produced four of the six code
 * defects it is meant to catch.
 *
 * Two ways to use it:
 *
 * 1. **Count.** `countingBag` answers "how many times does this door read a
 *    key?" — the only instrument that discriminates, because a consistent getter
 *    produces the same outcome however many times it is read. A door with a
 *    count above 1 has a TOCTOU whether or not any test can currently see it.
 *
 * 2. **Discriminate.** `driftingBag` makes the second read answer differently,
 *    turning a latent double read into an observable wrong outcome.
 */

/** A bag plus the running per-key invocation count of its getters. */
export interface CountedBag<T> {
  readonly bag: T;
  /** Invocations per key, so far. Live — read it after the call under test. */
  readonly reads: Readonly<Record<string, number>>;
}

function accessorBag<T extends object>(
  source: T,
  valueFor: (key: string, nth: number) => unknown,
): CountedBag<T> {
  const reads: Record<string, number> = {};
  const bag = {};

  for (const key of Object.keys(source)) {
    Object.defineProperty(bag, key, {
      enumerable: true,
      configurable: true,
      get(): unknown {
        reads[key] = (reads[key] ?? 0) + 1;

        return valueFor(key, reads[key]);
      },
    });
  }

  return { bag: bag as T, reads };
}

/**
 * A bag that answers `source` every time and counts each read.
 *
 * Use to assert a read COUNT. The outcome is identical to passing `source`
 * directly, which is the point: the count is the only thing that moves.
 */
export function countingBag<T extends object>(source: T): CountedBag<T> {
  return accessorBag(source, (key) => (source as Record<string, unknown>)[key]);
}

/**
 * A bag that answers `first` on a key's FIRST read and `then` on every later
 * one, counting both.
 *
 * Use to turn a double read into an observable divergence: the door admits the
 * key on one value and uses the other. A key absent from `then` keeps answering
 * `first`.
 */
export function driftingBag<T extends object>(
  first: T,
  then: Partial<T>,
): CountedBag<T> {
  return accessorBag(first, (key, nth) =>
    nth === 1 || !Object.hasOwn(then, key)
      ? (first as Record<string, unknown>)[key]
      : (then as Record<string, unknown>)[key],
  );
}

/** A bag whose first read of any key throws — a caller's getter that fails. */
export function throwingBag<T extends object>(source: T, error: Error): T {
  return accessorBag(source, () => {
    throw error;
  }).bag;
}

/**
 * The container shapes a caller-supplied bag legitimately arrives in.
 *
 * `ownEnumerable` is the CONTROL: every other shape must produce the same
 * observable result, or the door treats a supported input as absent. Under the
 * project's supported-input rule (own enumerable only) `inherited` and
 * `ownNonEnumerable` are expected to read as EMPTY — pin whichever your door
 * promises, but pin it, because the difference is otherwise silent.
 */
export const CONTAINER_SHAPES: readonly (readonly [
  label: string,
  wrap: (source: Record<string, unknown>) => Record<string, unknown>,
])[] = [
  [
    "own enumerable (control)",
    (source: Record<string, unknown>): Record<string, unknown> => ({
      ...source,
    }),
  ],
  [
    "inherited through the prototype",
    (source: Record<string, unknown>): Record<string, unknown> =>
      Object.create(source) as Record<string, unknown>,
  ],
  [
    "own non-enumerable",
    (source: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};

      for (const key of Object.keys(source)) {
        Object.defineProperty(out, key, {
          value: source[key],
          enumerable: false,
        });
      }

      return out;
    },
  ],
  [
    "pass-through Proxy (a reactive store)",
    (source: Record<string, unknown>): Record<string, unknown> =>
      new Proxy(
        { ...source },
        {
          get: (target, key, receiver): unknown =>
            Reflect.get(target, key, receiver),
        },
      ),
  ],
  [
    "null-prototype",
    (source: Record<string, unknown>): Record<string, unknown> =>
      Object.assign(Object.create(null) as Record<string, unknown>, source),
  ],
  [
    "an own __proto__ key, as JSON.parse yields",
    // ⚠ The key MUST come from JSON text. A source literal `{ __proto__: v }`
    // sets the prototype instead of creating an own key — measured: the first
    // draft of this shape round-tripped a literal through `JSON.stringify` and
    // produced no `__proto__` at all, and the self-test below caught it. The
    // reachable producers of the own form are `JSON.parse` and
    // `URLSearchParams`, which is exactly why the shape belongs here.
    (source: Record<string, unknown>): Record<string, unknown> =>
      Object.assign(
        JSON.parse('{"__proto__":"from-the-wire"}') as Record<string, unknown>,
        source,
      ),
  ],
];

/**
 * Containers that are not objects at all. Reachable from JavaScript and from a
 * config assembled at runtime; bare core tolerates each, so a door that crashes
 * on one is refusing input its siblings accept.
 */
export const NON_OBJECT_CONTAINERS: readonly (readonly [
  label: string,
  value: unknown,
])[] = [
  ["undefined", undefined],
  ["null", null],
  ["an empty string", ""],
  ["zero", 0],
  ["a string", "nope"],
  ["a number", 7],
];
