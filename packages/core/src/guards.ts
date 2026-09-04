// packages/core/src/guards.ts

import { events } from "./constants";
import { validateRouteType } from "./engine";
import { SEAM } from "./internals";

import type { LoggerConfig, LogLevelConfig, Route } from "./types";
import type { RouterValidator } from "./types/RouterValidator";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point any of these AFTER boot — which is what this closes.
 * Measured on the uncaptured form: one naive `Object.hasOwn` polyfill walked
 * straight through five sibling readers while the single captured guard held.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module — the ordinary
 * polyfill order. Measured: a naive `Object.hasOwn` imported ahead of core
 * reproduces #1798 verbatim (`buildPath` prints the native method into the
 * URL).
 *
 * ⚑ **The doctrine is DERIVED, not remembered (#1971).** A rule that lives in
 * headers is scattered discipline, and scattered discipline is precisely what
 * this header's own "five sibling readers" measurement says does not hold. So
 * `tests/functional/captured-intrinsics-authority-1971.test.ts` walks core and
 * `shared/` for any call to one of the seven DECIDING intrinsics outside a
 * capture, and requires a written reason for anything that survives.
 *
 * ⚑ `shared/` is in that walk deliberately, and it is where the convention pays
 * most: measured there, three of its raw reads FAIL OPEN — a re-pointed
 * `getPrototypeOf` admits a `Date` into `state.params`, `values` admits a nested
 * function, `keys` skips option validation entirely. Core's raw reads mostly
 * degrade toward refusal; that half flipped the verdict to "valid".
 *
 * ⚑ **The doctrine covers two categories (#2072 / #2073).** The seven above
 * DECIDE — each answers "what is on this object", so a re-pointed one changes a
 * VERDICT. `Object.create` and `Object.freeze` answer nothing; they BUILD the
 * object every one of those answers is about, so a re-pointed one removes the
 * guarantee instead. Measured: a shimmed `Object.create` sends `emptyRecord`'s
 * table back to `Object.prototype` and loses a declared `__proto__` param
 * (#1825), and a shimmed `Object.freeze` leaves `matcherOptions` writable so a
 * swapped `queryParams` throws out of `add()` (#1839). Both categories are
 * DERIVED by the same authority suite; only the BUILD half is scoped to calls
 * that RUN AFTER BOOT, because a module-scope one is evaluated before any
 * application code and a capture buys nothing there.
 */
const objectKeys = Object.keys;
const objectValues = Object.values;
const hasOwn = Object.hasOwn;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const ObjectCtor = Object;

// ============================================================================
// Structural invariant guards (dependencies + route-tree shape)
// ============================================================================

/**
 * Refuses a route name that is not a string, naming the DOOR (#1896 / #1888).
 *
 * A route name reaches core's tables as a property key, so `ToPropertyKey`
 * coerces anything else — which makes a non-string a call into application code
 * and, where two stores disagree about the key, a registration that reports as
 * present and never runs.
 *
 * The wording is `@real-router/validation-plugin`'s `validateRouteName`, byte
 * for byte, including its `typeof` quirks (`typeof null === "object"`), so the
 * no-plugin error matches the with-plugin one. Pinned by that package's
 * `bare-core-message-parity` suite.
 */
/**
 * The seven names the emitter can ever dispatch, derived from the constant that
 * declares them — not a second hand-written list (#1888).
 */
const VALID_EVENT_NAMES: ReadonlySet<string> = new Set(objectValues(events));

/**
 * Refuses an event name outside that set (#1888).
 *
 * The emitter keys its listener map by whatever it is handed, so a name nothing
 * emits — an object, or a typo'd string — registers cleanly and never fires,
 * and the door returns an unsubscribe either way. Unlike a route name, the
 * valid set is CLOSED and core declares it, so membership is the predicate and
 * it closes the typo too.
 *
 * The wording mirrors `@real-router/validation-plugin`'s `validateEventName`
 * byte for byte, so the no-plugin error matches the with-plugin one.
 */
export function assertEventNameIsValid(eventName: unknown): void {
  if (!VALID_EVENT_NAMES.has(eventName as string)) {
    throw new TypeError(
      `[router.addEventListener] Invalid event name: ${String(eventName)}. Must be one of: ${[...VALID_EVENT_NAMES].join(", ")}`,
    );
  }
}

/**
 * Refuses an interceptor core cannot run (#2088). An always-on guard, and it
 * meets BOTH halves of the criterion `CLAUDE.md` states for one.
 *
 * `addInterceptor` keys its map by whatever it is handed and nothing ever wraps
 * an entry under a name no seam reads, so a typo registers cleanly, never fires,
 * and hands back a working `Unsubscribe` — silent corruption in what the
 * application ships, with a green suite (a). A non-function is worse-shaped: it
 * is admitted here and thrown from whichever navigation reaches the seam first,
 * which is the deferred crash (b). Both live on one call, so the guard takes
 * both; refusing the name alone would leave the same door half-open.
 *
 * ⚑ Membership is asked of {@link SEAM}, the object the wrappers take their own
 * names from — so the set that decides is the set that acts, and there is no
 * second list to keep in step.
 *
 * ⚠ Nothing here COERCES the name, and both halves of that are load-bearing.
 * `hasOwn` performs `ToPropertyKey`, so without the `typeof` term an object
 * whose `toString` returns `"buildPath"` would be ADMITTED as that seam; and the
 * message renders a non-string by its type rather than through `String()`, which
 * would call the same `toString` one line later. A diagnostic must not be the
 * thing that runs application code.
 *
 * Core is the only publisher of this refusal. A mirror in `validation-plugin`
 * would be a second copy of a set core owns at RUNTIME, with nothing holding the
 * two together — the shape #2088 exists to remove.
 */
/**
 * Refuses a non-function event listener (#2088).
 *
 * The name half of this door is {@link assertEventNameIsValid}; this is the
 * other argument, and it fails LATER rather than louder: the emitter stores
 * whatever it is handed, isolates the call, and logs `cb is not a function` on
 * every emit of that event for the life of the router — a registration that
 * reported success and never works. Refusing here turns a permanent per-emit log
 * into one error at the line that caused it.
 *
 * The wording mirrors `@real-router/validation-plugin`'s `validateListenerArgs`
 * byte for byte, the same convention the event-name half follows, and
 * `bare-core-message-parity.test.ts` pins the pair.
 */
export function assertListenerIsFunction(cb: unknown): void {
  if (typeof cb !== "function") {
    throw new TypeError(
      `[router.addEventListener] callback must be a function, got ${typeof cb}`,
    );
  }
}

export function assertInterceptableSeam(method: unknown, fn: unknown): void {
  if (typeof method !== "string" || !hasOwn(SEAM, method)) {
    throw new TypeError(
      `[router.addInterceptor] Invalid method: ${
        typeof method === "string" ? `"${method}"` : typeof method
      }. Must be one of: ${objectKeys(SEAM).join(", ")}`,
    );
  }

  if (typeof fn !== "function") {
    throw new TypeError(
      `[router.addInterceptor] interceptor must be a function, got ${typeof fn}`,
    );
  }
}

export function assertRouteNameIsString(
  name: unknown,
  methodName: string,
): asserts name is string {
  if (typeof name !== "string") {
    throw new TypeError(
      `[router.${methodName}] Route name must be a string, got ${typeof name}`,
    );
  }
}

export function guardDependencyShape(deps: unknown): void {
  if (!deps || typeof deps !== "object") {
    throw new TypeError("dependencies must be a plain object");
  }

  // ⚑ The PROTOTYPE, not `deps.constructor` (#1858). `constructor` is an
  // ordinary dependency name — `set("constructor", v)` stores it and `has`/`get`
  // agree — so a predicate reading it back depends on a name the CALLER
  // controls, and `cloneRouter` re-guards the bag it rebuilds. Such a predicate
  // is forgeable both ways: `Object.assign(Object.create(null),
  // { constructor: Object })` would pass it while a bare `Object.create(null)`
  // would not, so it admits neither exactly the plain objects nor exactly the
  // others.
  //
  // The instance is what the caller writes to; the PROTOTYPE is not, so asking
  // it the same question is out of reach of an ordinary dependency name.
  //
  // `null` is admitted deliberately: `Object.create(null)` is a plain bag with
  // no prototype to inherit through, and the dependency store itself is built
  // that way. Refusing it was an accident of the old spelling.
  //
  // ⚠ The two rows above are the INTENDED differences from the old predicate,
  // not the only ones — a hand-picked sample of shapes agrees on the rest and
  // the family does not. The others, all found by review:
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
  // `undefined` for every one of them, so a `for…in` walk paired with this
  // check would iterate exactly the names it cannot judge and pass a forbidden
  // getter straight through. Own-only here, which is also the
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
 * tidy-up.** As two `Object.keys` calls on the same object, one after the
 * other, they agree for an ordinary object and the verdict covers what is
 * installed; for a `Proxy` they need not, because `ownKeys` is a trap and a trap
 * may answer differently on its second invocation. Measured: a
 * bag answering `[]` then `["evil"]` passed the judge and installed `evil` —
 * unjudged, with the caller's `get` trap invoked once. Here the descriptor is
 * asked and the value is read for the SAME key inside the SAME iteration, so
 * "installed but not judged" is unconstructible rather than guarded against.
 *
 * ⚠ All three doors share this one walk, and that is why the parity fix and the
 * single-walk fix are one edit: a door given a judge while its own copy loop is
 * left alone carries the very defect the paragraph above rules out.
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
  // installing in the SAME iteration reds `setall-reentrancy-1859` —
  // `{ a: 1, get b() {…} }` installs `a`, then throws about `b`, a partial write
  // on a live store. Only `setAll` shows it: the constructor door hides it (a
  // throwing constructor discards its router) and so does `cloneRouter` (it
  // stages into a local), which is why the doors have to be read together.
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
export function guardRouteStructure(routes: Route<any>[]): void {
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

    // ⚑ The OBJECT-shape questions run HERE, on the caller's value, because a
    // snapshot answers all of them the same way whatever it was made from
    // (#1911). `validateRouteType` owns them; this door owns the position.
    //
    // ⚠ `"addRoute"` for every door, deliberately: the plugin reports that name
    // for `replace` batches too, so bare core and the plugin surface one string.
    validateRouteType(routeValue, "addRoute");

    const children = (route as Route).children;

    if (children) {
      guardRouteStructure(children);
    }
  }
}

/**
 * The validator's per-route CALLBACK guards, walked over a batch.
 *
 * ⚑ Separate from {@link guardRouteStructure} because the two need different
 * operands (#1911). The structural check must see the CALLER's value — a spread
 * turns every shape it exists to refuse into a plain object — while these read
 * the route's own keys and must therefore see the SNAPSHOT, or a definition that
 * answers differently per read is validated under one callback and registered
 * with another. Run this after `snapshotRouteBatch`, never on the caller's array.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors guardRouteStructure's variance */
export function guardRouteCallbacks(
  routes: readonly Route<any>[],
  validator?: RouterValidator | null,
): void {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!validator) {
    return;
  }

  for (const route of routes) {
    validator.routes.guardRouteCallbacks(route as Route);
    validator.routes.guardNoAsyncCallbacks(route as Route);

    const children = (route as Route).children;

    if (children) {
      guardRouteCallbacks(children, validator);
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
 * ⚑ It RETURNS rather than only asserting, and that is the fix rather than a
 * signature preference. Asserting only leaves the caller's bag read by TWO
 * independent readers — this guard, then `RouterLogger.configure` — free to
 * disagree about own-ness (`in` against `hasOwn`) and free to be handed
 * different values on their two reads, so the `typeof` gate here need not cover
 * what `configure` stores. Returning collapses them to one reader.
 * `logger-config-read-once-1814.test.ts` owns the read count;
 * `packages/core/CLAUDE.md` "Supported Input Shapes" settles the own-ness
 * question, own-enumerable-only.
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
  // `configure` asks `hasOwn` of THIS record — the same question it would ask
  // of the caller's bag, only of an object core owns.
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
