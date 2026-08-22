// packages/core/src/guards.ts

import type { LoggerConfig, LogLevelConfig, Route } from "./types";
import type { RouterValidator } from "./types/RouterValidator";

/**
 * Intrinsics captured at module load: `objectKeys`, `getOwnPropertyDescriptor`,
 * `getPrototypeOf`, `Object` itself.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module — the ordinary
 * polyfill order. Measured: a naive `Object.hasOwn` imported ahead of core
 * reproduces #1798 verbatim (`buildPath` prints the native method into the
 * URL). Two earlier revisions of this header said "before any application
 * code can run", which is the sentence a future reader would have trusted.
 */
const objectKeys = Object.keys;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const ObjectCtor = Object;

// ============================================================================
// Structural invariant guards (dependencies + route-tree shape)
// ============================================================================

export function guardDependencies(deps: unknown): void {
  if (!deps || typeof deps !== "object") {
    throw new TypeError("dependencies must be a plain object");
  }

  // ⚑ The PROTOTYPE, not `deps.constructor` (#1858). `constructor` is an
  // ordinary dependency name — `set("constructor", v)` stores it and `has`/`get`
  // agree — and reading it back made the router permanently un-clonable, since
  // `cloneRouter` rebuilds the bag and re-guards it. Measured: `constructor`
  // failed all three doors while `toString` / `valueOf` / `hasOwnProperty`
  // passed, so the predicate depended on one name the caller controls.
  //
  // It was also forgeable both ways: `Object.assign(Object.create(null),
  // { constructor: Object })` was ACCEPTED while a bare `Object.create(null)`
  // was refused — i.e. it admitted neither exactly the plain objects nor
  // exactly the others.
  //
  // The instance is what the caller writes to; the PROTOTYPE is not, so asking
  // it the same question is out of reach of an ordinary dependency name.
  //
  // `null` is admitted deliberately: `Object.create(null)` is a plain bag with
  // no prototype to inherit through, and the dependency store itself is built
  // that way. Refusing it was an accident of the old spelling.
  //
  // ⚠ The two rows above are the INTENDED differences from the old predicate,
  // not the only ones. A first draft of this comment claimed "differs on exactly
  // two rows and agrees on the rest"; that was measured over ten hand-picked
  // shapes and is false over the family. The others, all found by review:
  //
  //   Object.setPrototypeOf([1, 2], null)              refused -> ACCEPTED
  //   array / Map / class instance whose OWN
  //     `constructor` is forged to `Object`            accepted -> REFUSED
  //   Proxy answering `get` and `getPrototypeOf`
  //     inconsistently                                 moves in BOTH directions
  //
  // The middle row is a tightening and the top one is harmless (only own
  // enumerable string keys are ever copied), but none of them was intended, and
  // a comment that under-reports its own blast radius is worse than one that
  // says nothing. What the change really does is move the caller-controlled lie
  // from the `get` trap to the `getPrototypeOf` trap.
  //
  // ⚠ This predicate DISAGREES with its sibling: `engine/validation/route-batch`
  // asks `proto !== Object.prototype && proto !== null` for the same question
  // about route objects, so `Object.create({ … })` is a plain object here and is
  // not one there. Deliberate, and it is the reason the sibling's spelling was
  // not reused: it would refuse the bag #1799 / #1823 need to REACH the copy
  // loop, where an inherited key is dropped rather than the bag rejected. If the
  // two are ever unified, that is the constraint to unify around.
  //
  // ⚠ `getPrototypeOf` and `Object` are both captured; `Object.prototype` needs
  // no capture — it is `writable: false, configurable: false`, and neither
  // `Reflect.setPrototypeOf` nor `__proto__` assignment can move it. But the
  // read below is `proto.constructor`, which resolves through
  // `Object.prototype.constructor` — writable, configurable, and NOT closeable
  // without comparing prototype identity, which the paragraph above rules out.
  // Re-point it and every plain bag is refused. That hole is open, in both this
  // spelling and the one it replaced, and it is stated here rather than left for
  // the next reader to find.
  const proto = getPrototypeOf(deps) as { constructor?: unknown } | null;

  if (proto !== null && proto.constructor !== ObjectCtor) {
    throw new TypeError("dependencies must be a plain object");
  }
  // ⚑ The walk and the check must answer about the SAME property set (#1799).
  // `for…in` enumerates inherited names; `getOwnPropertyDescriptor` answers
  // `undefined` for every one of them, so `?.get` never fired and the guard
  // iterated exactly the names it could not judge — one `Object.create` put a
  // forbidden getter straight past it. Own-only here, which is also the
  // supported-input boundary: an inherited key is not supported input, so it is
  // not a dependency at all and there is nothing to refuse. The copy loops
  // enforce the same rule, so such a name never reaches the store either.
  for (const key of objectKeys(deps)) {
    if (getOwnPropertyDescriptor(deps, key)?.get) {
      throw new TypeError(`dependencies cannot contain getters: "${key}"`);
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- accepts any Route type */
export function guardRouteStructure(
  routes: Route<any>[],
  validator?: RouterValidator | null,
): void {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  for (const route of routes) {
    const routeValue: unknown = route;

    if (
      routeValue === null ||
      typeof routeValue !== "object" ||
      Array.isArray(routeValue)
    ) {
      throw new TypeError("route must be a non-array object");
    }

    validator?.routes.guardRouteCallbacks(route as Route);
    validator?.routes.guardNoAsyncCallbacks(route as Route);
    const children = (route as Route).children;

    if (children) {
      guardRouteStructure(children, validator);
    }
  }
}

// ============================================================================
// Logger config assertion (RealRouter-specific)
// ============================================================================

const VALID_LEVELS_SET = new Set<string>([
  "all",
  "warn-error",
  "error-only",
  "none",
]);

function isValidLevel(value: unknown): value is LogLevelConfig {
  return typeof value === "string" && VALID_LEVELS_SET.has(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}

export function assertLoggerConfig(
  config: unknown,
): asserts config is LoggerConfig {
  if (typeof config !== "object") {
    throw new TypeError("Logger config must be an object");
  }

  // `typeof null === "object"`, so TS still sees `object | null` here — but the
  // sole caller (Router's ctor) gates on `if (loggerConfig)`, so null/falsy never
  // arrives; treat it as the non-null object the gate guarantees.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- gated caller never passes null
  const obj = config!;

  // Check for unknown properties
  for (const key of objectKeys(obj)) {
    if (
      key !== "level" &&
      key !== "callback" &&
      key !== "callbackIgnoresLevel"
    ) {
      throw new TypeError(`Unknown logger config property: "${key}"`);
    }
  }

  // Validate level if present
  if ("level" in obj && obj.level !== undefined && !isValidLevel(obj.level)) {
    throw new TypeError(
      `Invalid logger level: ${formatValue(obj.level)}. Expected: "all" | "warn-error" | "error-only" | "none"`,
    );
  }

  // Validate callback if present
  if (
    "callback" in obj &&
    obj.callback !== undefined &&
    typeof obj.callback !== "function"
  ) {
    throw new TypeError(
      `Logger callback must be a function, got ${typeof obj.callback}`,
    );
  }

  // Validate callbackIgnoresLevel if present (logger.configure does not type-check it)
  if (
    "callbackIgnoresLevel" in obj &&
    obj.callbackIgnoresLevel !== undefined &&
    typeof obj.callbackIgnoresLevel !== "boolean"
  ) {
    throw new TypeError(
      `Logger callbackIgnoresLevel must be a boolean, got ${typeof obj.callbackIgnoresLevel}`,
    );
  }
}
