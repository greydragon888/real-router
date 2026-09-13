// packages/core/src/namespaces/OptionsNamespace/matcherOptions.ts

import type { CreateMatcherOptions, QueryParamsConfig } from "../../engine";
import type { DefaultDependencies, Options } from "../../types";

/**
 * Captured at module load (#2073); `captured-intrinsics-authority-1971.test.ts`
 * owns the rule.
 */
const freeze = Object.freeze;

/** The frozen empty snapshot, for a caller that supplied no `queryParams` at all. */
const EMPTY_QUERY_PARAMS: QueryParamsConfig = Object.freeze({});

/**
 * Coerces one format slot to its STRING key, once, at snapshot time.
 *
 * ⚑ The snapshot copies the four values, and copying a value by reference is not
 * the same as capturing it. `requireStrategy` coerces each one with
 * `ToPropertyKey` to look it up, so an object-valued format is re-read on every
 * matcher build — and the matcher is rebuilt more often than "at construction"
 * suggests: `setRootPath`, `replace()`, and `dispose()`, which reaches
 * `resetStore` → `rebuildTreeInPlace` → `createMatcher`.
 *
 * Without it a `{ toString }` answering `"none"` then `"bogusTypo"` constructs
 * cleanly and makes **`dispose()` throw** the config error, out of a method that
 * is idempotent by contract and is called from `finally` blocks — where a throw
 * discards whatever error was already travelling. Freezing the CONTAINER does
 * not reach this: it stops the bag being swapped, and a single slot can still
 * answer twice.
 *
 * Coercing here means the caller's object is read exactly once per router, at
 * construction, and every later rebuild resolves from a string. It does not
 * change which configs are refused — `requireStrategy` sees the same key it
 * would have computed — only how many times the caller is asked.
 *
 * ⚠ `typeof` first is a PERF TERM, and a tiny one — it is NOT a guard, and
 * reading it as one is what this paragraph exists to prevent. Measured both
 * ways. INERT: delete the branch, so every non-nullish slot goes through
 * `String(value)`, and the whole suite stays green — for a string
 * `String(s)` returns `s` itself, and `ToString` of a String consults no user
 * code, so nothing observable rides on the test. WORTH: the branch saves
 * ~0.9 ns per slot, i.e. ~3.5 ns per `createRouter`, against a construction
 * measured at ~13.6 µs — 0.03 %, two orders of magnitude under the 10 %
 * CodSpeed gate, and nothing in the gate measures it. It stays for the reason
 * the same shape stays in `requireStrategy`: the coercion is reserved for
 * exactly the values that are not already keys.
 *
 * ⚑ So it is an EQUIVALENT MUTANT by construction: no test can kill it, and a
 * mutation run reporting this branch as survived is right. This note is the
 * answer to that report — do not "cover" it with a test that cannot fail.
 *
 * ⚠ NULLISH IS ABSENCE, and both halves carry weight. Guarding `undefined`
 * alone lets `null` reach `String(null)` and become the STRING `"null"`, which
 * `makeOptions`' `?? DEFAULT_QUERY_PARAMS.x` can then never rescue, because it
 * is handed a non-nullish value. `null` is what a config from `JSON.parse`,
 * from YAML, or from `cfg.x ?? null` actually carries — never `undefined` — so
 * this is the reachable half of "nullish", not the exotic one.
 *
 * ⚠ A `symbol` is deliberately NOT special-cased, and the reason is NOT that
 * `String` throws on one: it does not. `String(Symbol("x"))` is `"Symbol(x)"` —
 * the single legal symbol stringification, which is why a template literal
 * (`${symbol}`) and `symbol + ""` throw where this call does not. That is what
 * makes the named refusal possible: `requireStrategy` receives `"Symbol(x)"`,
 * finds no such key, and reports the option by name.
 */
function asKey<K extends keyof QueryParamsConfig>(
  field: K,
  bag: QueryParamsConfig,
): QueryParamsConfig[K] | undefined {
  // ⚑ The READ happens HERE, inside the guarded region, and that placement is
  // the point. Reading the slot at the CALL SITE — `asKey("arrayFormat",
  // queryParams.arrayFormat)` — invokes an accessor-backed bag's getter one
  // frame ABOVE this try/catch, so a `{ get arrayFormat() { throw } }` config
  // escapes `createRouter` as a raw `Error`, with no `cause` and no option
  // named, against the paragraph below. An accessor-backed config is the
  // ordinary lazy-config spelling, not an exotic one.
  //
  // ⚑ The container is not read before this point (#1832): core freezes only the
  // level it owns, so nothing asks a caller's bag for `constructor`, and a Proxy
  // whose trap throws on that slot reaches this try/catch like any other. Pinned
  // by the CONTROL cell in `query-strategy-formats-1796.test.ts`.
  let value: QueryParamsConfig[K] | undefined;

  try {
    value = bag[field];
  } catch (error) {
    throw new TypeError(
      `[router.constructor] Invalid "queryParams.${field}": reading it threw.`,
      { cause: error },
    );
  }

  // `== null` is the intent: BOTH nullish values mean "the caller said nothing",
  // and `makeOptions`' `??` downstream is what turns that into the default.
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  // ⚠ `String(value)` runs the CALLER's code, and this snapshot moved that call
  // into `createRouter`. Uncaught, an application's own exception escapes the
  // constructor naming no option at all — strictly less useful than the named
  // refusal one line down, and a shape `options.test.ts` pins the opposite of
  // for the sibling `defaultRoute` slot. So the coercion answers for itself: a
  // value we cannot READ is a config fault about THIS field, and the original
  // error rides along as `cause` rather than being replaced by it.
  //
  // ⚠ The message does not name `toString`, and that is deliberate — TWO shapes
  // land here and only one of them threw. A `toString` that RETURNS a symbol
  // makes `String()` throw from the conversion, not from the callback; saying
  // "its toString threw" would be false for exactly the case a developer would
  // find hardest to see. `cause` carries the real mechanism.
  try {
    // The cast is the honest shape: the STATIC type says this slot is one of the
    // declared union members, and the runtime disagrees — that is the whole
    // reason the coercion exists. What comes back may name no strategy at all,
    // and `requireStrategy` is the one that decides, by the same key it would
    // have computed itself.
    return String(value) as QueryParamsConfig[K];
  } catch (error) {
    throw new TypeError(
      `[router.constructor] Invalid "queryParams.${field}": its value cannot be converted to a string.`,
      { cause: error },
    );
  }
}

/**
 * ⚑ Read ONCE, here, and hand the KEY downstream — the same treatment
 * `snapshotQueryParams` gives `queryParams`, the next property in the literal
 * below, and for the same reason (#1839).
 *
 * The declared type is a union of four literals, and that union is precisely
 * what cannot be trusted: the option reaches here from JavaScript consumers and
 * from configs assembled at runtime, which is the population `SegmentMatcher`'s
 * own `"default"` fallback exists for. Stored raw in
 * `RoutesStore.matcherOptions`, an object-valued encoding is left for the
 * matcher's constructor to coerce — so a `toString`- or
 * `Symbol.toPrimitive`-backed VALUE is read again on every matcher rebuild:
 * `add` / `remove` / `replace` / `clear` / `setRootPath`, and the `resetStore`
 * that `dispose()` goes through. (A getter
 * on the OPTIONS BAG was never affected — the constructor's rest-spread
 * materialises it once.)
 *
 * Coercing here moves that into construction, where application code is
 * expected and where a throw is loud and total. `cloneRouter` inherits the key
 * rather than re-reading the option (#1877), so the unit is one read per router
 * TREE.
 *
 * ⚠ NOT `asKey`: that helper is typed `keyof QueryParamsConfig`, takes a
 * `QueryParamsConfig` bag, and hardcodes `queryParams.${field}` into its
 * message, so reusing it would widen a guard four other call sites depend on.
 *
 * The table lookup and the `"default"` fallback stay in `SegmentMatcher`, which
 * already stores the key it tested. This only guarantees that what it tests is
 * plain data by the time it gets there.
 */
function snapshotEncodingKey(
  value: unknown,
): NonNullable<CreateMatcherOptions["urlParamsEncoding"]> {
  // `== null` is the intent: both nullish spellings mean "the caller said
  // nothing", and `exactOptionalPropertyTypes` forbids answering `undefined`.
  // This arm is not cosmetic and it is pinned: without it the stored key would
  // read `"null"`, and that slot is published through
  // `@real-router/core/validation`.
  if (value == null) {
    return "default";
  }

  try {
    // Identity for a string, `ToString` for anything else. There is no
    // `typeof value === "string"` fast path in front of this: it would run once
    // per router constructor, it was never benchmarked, and `String("uri")` is
    // already `"uri"` — an unmeasured branch that changes no answer is a branch
    // no mutation can pin. The matcher's table lookup rejects whatever comes out
    // and falls back to `"default"`, exactly as it did when it ran this coercion
    // itself; the lint rule reads the declared union, which is what this
    // distrusts.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- see above
    return String(value) as NonNullable<
      CreateMatcherOptions["urlParamsEncoding"]
    >;
  } catch (error) {
    throw new TypeError(
      `[router.constructor] Invalid "urlParamsEncoding": coercing it threw.`,
      { cause: error },
    );
  }
}

/**
 * A plain-data copy of the caller's `queryParams`, read once.
 *
 * ⚑ The four names are written out, and that is a hand enumeration of
 * `search-params`' `Options` — bound to it by the `search-params Options ↔
 * snapshotQueryParams' copy` relation in
 * `tests/functional/type-mirror-authority.test.ts`, which derives the key set
 * from the type and fails if a fifth field is added without reaching here. A
 * spread would not need the list, but would drop the two shapes the comment at
 * the call site names.
 *
 * ⚠ These reads WALK the prototype chain, deliberately, and they are not the
 * class #1798 closed one directory over. That rule is about a key whose NAME
 * comes from a route declaration read off the CALLER's data bag, where an
 * `Object.prototype` member makes an empty bag answer "filled". Here the four
 * names are literals written above, none of them is a member of
 * `Object.prototype`, and the chain walk is the FEATURE — it is what lets one
 * config be layered over another. Do not "fix" this to `Object.hasOwn`.
 */
function snapshotQueryParams(
  queryParams: QueryParamsConfig | undefined,
): QueryParamsConfig {
  // `!` rather than `=== undefined`: the STATIC type says the container is an
  // object or absent, and the runtime disagrees — `{ queryParams: null }` is
  // reachable from JavaScript and from a config assembled at runtime. Mirrors
  // `makeOptions`' own `!opts` guard, which is the collaborator this feeds.
  if (!queryParams) {
    return EMPTY_QUERY_PARAMS;
  }

  // ⚠ Into locals FIRST, and this is the whole point of the helper rather than a
  // style choice. `...(queryParams.x !== undefined && { x: queryParams.x })`
  // reads the property TWICE — once for the test, once for the value — which is
  // the exact TOCTOU this snapshot exists to collapse, merely moved out of
  // `makeOptions` and into here. Measured with a getter that answers differently
  // on its second call: the router ran on the SECOND value while the test that
  // admitted it saw the first.
  // ⚑ FROZEN, and for the reason `encode.ts` freezes its three defaults: this
  // object is reachable from outside core through `getInternals`
  // (`@real-router/core/validation`), and every matcher rebuild re-reads it. The
  // slot it replaced is sealed by nobody else — `OptionsNamespace` freezes only
  // the level it owns (#1832) — so a plain literal would be writable: a write took
  // effect on the next rebuild, and `Object.defineProperty` could re-install an
  // accessor in the very slot this snapshot exists to empty, restoring the defect
  // it fixes. Nothing in the repo writes it, so the freeze costs nothing and makes
  // read-only structural rather than conventional.
  const arrayFormat = asKey("arrayFormat", queryParams);
  const booleanFormat = asKey("booleanFormat", queryParams);
  const nullFormat = asKey("nullFormat", queryParams);
  const numberFormat = asKey("numberFormat", queryParams);

  return freeze({
    ...(arrayFormat !== undefined && { arrayFormat }),
    ...(booleanFormat !== undefined && { booleanFormat }),
    ...(nullFormat !== undefined && { nullFormat }),
    ...(numberFormat !== undefined && { numberFormat }),
  });
}

/**
 * Derives CreateMatcherOptions from router Options.
 * Maps core option names to matcher option names.
 */
export function deriveMatcherOptions<Dependencies extends DefaultDependencies>(
  options: Readonly<Options<Dependencies>>,
): CreateMatcherOptions {
  // ⚑ The CONTAINER is frozen too, not only the snapshot inside it, and that is
  // the half a first pass missed. Freezing the snapshot stops a WRITE INTO it;
  // it does nothing about REPLACING the slot that holds it — and the slot is
  // reachable, through the very surface cited as the reason to freeze at all:
  // `getInternals(router).routeGetStore().matcherOptions` on the published
  // `@real-router/core/validation` subpath. Measured: swapping `queryParams`
  // there for `{ arrayFormat: "bogusTypo" }` made `add`, `setRootPath` and
  // `dispose()` throw, i.e. it restored the defect verbatim. Frozen, the write
  // fails at the write site instead.
  return freeze({
    strictTrailingSlash: options.trailingSlash === "strict",
    caseSensitive: options.caseSensitive,
    strictQueryParams: options.queryParamsMode === "strict",
    urlParamsEncoding: snapshotEncodingKey(options.urlParamsEncoding),
    // SNAPSHOT, not the caller's reference. `queryParams` is supported input and
    // may be accessor- or Proxy-backed, and this object is stored once as
    // `RoutesStore.matcherOptions` and re-read by `createMatcher` on EVERY matcher
    // rebuild — `add` / `remove` / `replace` / `setRootPath`, and `resetStore`,
    // which `dispose()` goes through. A live getter there is application code
    // running inside a teardown that core documents as holding together "only
    // because no user code runs in them" (CLAUDE.md, INVARIANTS Route Management
    // #17/#18): a getter that answered differently on the rebuild threw out of
    // `dispose()` AFTER `sendDispose()`, so `isDisposed()` was already true, the
    // idempotency early-return swallowed every retry, and everything BELOW the
    // throw never ran — `markDisposed`, the lifecycle teardown and the dependency
    // reset — so the router leaked every DI reference, per request, in an SSR
    // scope. ⚠ The event-bus `clearAll` is ABOVE it and does run; and what such a
    // router still answers is `buildPath` / `canNavigateTo` / `has`, not
    // `navigate` (the FSM is already down, so that one refuses — with the wrong
    // reason, `ROUTER_NOT_STARTED`). Measured on the pre-fix build against a
    // clean-dispose control.
    //
    // The snapshot reads each field exactly ONCE, during construction, where
    // application code is expected; every later read sees plain data. That also
    // collapses the TOCTOU inside `makeOptions`, which tests a field and then
    // re-reads it for the value. ⚠ Not "each field twice" — its fast path is a
    // `&&` chain, so it stops at the first DEFINED field: for the bag a router
    // actually passes, `arrayFormat` is read twice and the other three once.
    //
    // ⚑ ONCE, by the snapshot, and by nothing else: the freeze stops at the level
    // core owns (#1832), so it neither reads a value here nor asks for a
    // descriptor. Measured on a Proxy bag — four named reads, zero descriptor
    // traps — in `query-strategy-formats-1796.test.ts`. The count AFTER
    // construction is ZERO.
    // ⚠ Read by NAME, not `{ ...queryParams }`, and the difference is measured
    // rather than stylistic: a spread copies own ENUMERABLE keys, so an inherited
    // format (`Object.create({ arrayFormat: "brackets" })` — layering one config
    // over another) or an own non-enumerable one was silently dropped and the
    // router fell back to the defaults. Both worked before the snapshot, because
    // a plain `opts.arrayFormat` walks the prototype chain. Reading by name keeps
    // that lookup and still yields plain own data.
    //
    // The conditional spread is `exactOptionalPropertyTypes`: an optional
    // property may be absent but not present-and-`undefined`, and `makeOptions`
    // treats the two identically anyway (its fast path tests `=== undefined`).
    queryParams: snapshotQueryParams(options.queryParams),
  });
}
