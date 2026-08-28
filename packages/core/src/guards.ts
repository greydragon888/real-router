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
const hasOwn = Object.hasOwn;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const ObjectCtor = Object;

// ============================================================================
// Structural invariant guards (dependencies + route-tree shape)
// ============================================================================

export function guardDependencyShape(deps: unknown): void {
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
}

/**
 * The ONE door a caller-supplied dependency bag goes through (#1860 / #1861).
 *
 * Three call sites take such a bag — the constructor, `cloneRouter` and
 * `setAll` — and before this they applied three different rules: the constructor
 * refused a non-plain-object and a getter, `cloneRouter` merged the argument
 * into a fresh literal BEFORE the guard could see it (so the check was
 * structurally vacuous with respect to the value it judged), and `setAll`
 * reached no structural check at all. Measured across all three: a `Map` became
 * `{}` at two doors and threw at the third, i.e. every dependency the caller
 * passed vanished with no error — on `cloneRouter`, which is the per-request SSR
 * path `angular/providersFactory` forwards an application-authored bag into.
 *
 * ⚑ **Judge and copy are ONE walk, and that is the fix for #1861 rather than a
 * tidy-up.** They used to be two `Object.keys` calls on the same object, one
 * after the other. For an ordinary object the two walks agree and the verdict
 * covers what is installed; for a `Proxy` they need not, because `ownKeys` is a
 * trap and a trap may answer differently on its second invocation. Measured: a
 * bag answering `[]` then `["evil"]` passed the judge and installed `evil` —
 * unjudged, with the caller's `get` trap invoked once. Here the descriptor is
 * asked and the value is read for the SAME key inside the SAME iteration, so
 * "installed but not judged" is unconstructible rather than guarded against.
 *
 * ⚠ It was reachable at the CONSTRUCTOR only, measured — the other two doors
 * had no judge to disagree with their copier. So bolting `guardDependencyShape`
 * onto them and leaving their loops alone would have CREATED the defect at two
 * more doors; the parity fix and the single-walk fix are the same edit.
 *
 * ⚠ **The getter ban's limit is honest, not closed.** A `Proxy` that answers
 * `getOwnPropertyDescriptor` with a data descriptor and runs code from its `get`
 * trap gets that code run, because the copier must read the value to install it.
 * Measured: a bag with a STABLE `ownKeys` defeats the ban exactly as well as a
 * drifting one, so the single walk is not what stands between a caller and their
 * own code running. What the ban does enforce, it enforces against ordinary
 * objects, and `packages/core/CLAUDE.md` "Supported Input Shapes" is where the
 * boundary is written down.
 *
 * ⚑ **One WALK, but the SHAPE is asked twice at the constructor — measured, and
 * kept.** `Router` calls `guardDependencyShape` before `guardRouteStructure` so
 * "is this even an object" stays the first thing a caller hears about, and this
 * function asks again. For a `Proxy` that is two `getPrototypeOf` trap
 * invocations against one `ownKeys` — and both answers must pass, so a bag that
 * lies about its prototype is refused in EITHER order, where a single ask would
 * admit the one that lies on its first answer. Deleting the "duplicate" would
 * lose that; `dependency-door-parity-1860.test.ts` reds if it goes.
 *
 * `install` receives only keys that passed the ban and values that are not
 * `undefined` — `set(name, undefined)` is a documented no-op (INVARIANTS
 * "getDependenciesApi (CRUD)" #8) and the batch doors have always agreed.
 */
export function ingestDependencies(
  source: unknown,
  install: (key: string, value: unknown) => void,
): void {
  guardDependencyShape(source);

  const bag = source as Record<string, unknown>;
  const staged: [string, unknown][] = [];

  // ⚑ PREPARE, then COMMIT — the idiom route-CRUD already uses, and the reason
  // is the same: a refusal must leave the store untouched. Judging and
  // installing in the SAME iteration was written first and reds
  // `setall-reentrancy-1859`: `{ a: 1, get b() {…} }` installed `a` and then
  // threw about `b`, i.e. a partial write on a live store. The constructor door
  // hid it (a throwing constructor discards its router) and `cloneRouter` hid it
  // too (it stages into a local), so only `setAll` shows it — which is exactly
  // why the doors had to be brought together before this was visible at all.
  //
  // ⚠ Still ONE walk of the CALLER's bag, which is the whole point of #1861.
  // `staged` is core's own array, so replaying it runs no trap and asks the
  // caller nothing.
  for (const key of objectKeys(bag)) {
    if (getOwnPropertyDescriptor(bag, key)?.get) {
      throw new TypeError(`dependencies cannot contain getters: "${key}"`);
    }

    const value = bag[key];

    if (value !== undefined) {
      staged.push([key, value]);
    }
  }

  for (const [key, value] of staged) {
    install(key, value);
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

/**
 * Validates a caller's logger config and hands back CORE'S OWN copy of it
 * (#1814 / #1842).
 *
 * ⚑ It returns rather than only asserting, and that is the fix rather than a
 * signature preference. The caller's bag used to pass through TWO independent
 * readers — this guard, then `RouterLogger.configure` a few lines later — so
 * each field was read three times (measured: `level, level, callback, callback,
 * callbackIgnoresLevel, callbackIgnoresLevel` here, then one apiece there) and
 * the two readers disagreed twice over:
 *
 *   • **`in` versus `hasOwn`.** This guard asked `"callback" in obj` while the
 *     store asked `hasOwn`. Worse, it disagreed with ITSELF: the unknown-key scan
 *     above is `objectKeys`, i.e. own-only. Measured — an inherited `callback`
 *     holding a non-function was REFUSED, an inherited unknown property was
 *     ACCEPTED. The refusal is a FALSE one: a bag whose own keys are empty is a
 *     valid empty config, rejected for something on its prototype.
 *     `packages/core/CLAUDE.md` "Supported Input Shapes" settles which way it
 *     goes — own-enumerable-only, so an inherited key is invisible.
 *   • **Validate here, use there.** The `typeof` gates never reached the value
 *     `configure` stored. Measured: a `callback` answering a function to the two
 *     reads here and a string to `configure`'s installed the string, and the
 *     router's own error channel was dead for the life of the instance
 *     (`TypeError: this[#config].callback is not a function`). A `level` doing
 *     the same passed `configure`'s `hasOwn(LEVEL_CONFIGS, level)` on one
 *     coercion and indexed `undefined` on the next, so `level: "none"` — the
 *     setting that suppresses everything — let warnings through with no error
 *     at all.
 *
 * The rule applied is core's own, from `src/engine/CLAUDE.md`: *a guard that
 * admits by a computed key must hand the KEY downstream, never the value it
 * computed it from.* Here it hands the whole validated record.
 */
/** Own-only, and the ONE membership predicate the whole guard uses (#1814). */
function assertNoUnknownKeys(obj: Record<string, unknown>): void {
  for (const key of objectKeys(obj)) {
    if (
      key !== "level" &&
      key !== "callback" &&
      key !== "callbackIgnoresLevel"
    ) {
      throw new TypeError(`Unknown logger config property: "${key}"`);
    }
  }
}

/** One read, validated; `undefined` and absence both mean "not set". */
function readLoggerLevel(
  obj: Record<string, unknown>,
): LogLevelConfig | undefined {
  if (!hasOwn(obj, "level")) {
    return undefined;
  }

  const level = obj.level;

  if (level === undefined) {
    return undefined;
  }

  if (!isValidLevel(level)) {
    throw new TypeError(
      `Invalid logger level: ${formatValue(level)}. Expected: "all" | "warn-error" | "error-only" | "none"`,
    );
  }

  return level;
}

/** One read, validated; `undefined` and absence both mean "not set". */
function readCallbackIgnoresLevel(
  obj: Record<string, unknown>,
): boolean | undefined {
  if (!hasOwn(obj, "callbackIgnoresLevel")) {
    return undefined;
  }

  const flag = obj.callbackIgnoresLevel;

  if (flag === undefined) {
    return undefined;
  }

  if (typeof flag !== "boolean") {
    throw new TypeError(
      `Logger callbackIgnoresLevel must be a boolean, got ${typeof flag}`,
    );
  }

  return flag;
}

export function assertLoggerConfig(config: unknown): Partial<LoggerConfig> {
  if (typeof config !== "object" || config === null) {
    throw new TypeError("Logger config must be an object");
  }

  const obj = config as Record<string, unknown>;

  assertNoUnknownKeys(obj);

  const normalized: Partial<LoggerConfig> = {};
  const level = readLoggerLevel(obj);

  if (level !== undefined) {
    normalized.level = level;
  }

  // ⚠ `callback` is the one field where PRESENCE differs from definedness:
  // `configure({ callback: undefined })` CLEARS the sink, which is documented
  // and tested. So the key is carried even when the value is `undefined`, and
  // `configure` asks `hasOwn` of THIS record — exactly as it used to ask
  // `hasOwn` of the caller's bag, only now of an object core owns.
  if (hasOwn(obj, "callback")) {
    const callback = obj.callback;

    if (callback !== undefined && typeof callback !== "function") {
      throw new TypeError(
        `Logger callback must be a function, got ${typeof callback}`,
      );
    }

    normalized.callback = callback as LoggerConfig["callback"];
  }

  const flag = readCallbackIgnoresLevel(obj);

  if (flag !== undefined) {
    normalized.callbackIgnoresLevel = flag;
  }

  return normalized;
}
