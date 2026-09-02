import { throwIfDisposed } from "./helpers";
import { ingestDependencies } from "../guards";
import { dropUnsafeKey } from "../helpers";
import { getInternals } from "../internals";

import type { DependenciesApi } from "./types";
import type { DependenciesStore } from "../namespaces";
import type { DefaultDependencies, Router } from "../types";
import type { RouterValidator } from "../types/RouterValidator";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2072). */
const objectCreate = Object.create;

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const hasOwn = Object.hasOwn;

/**
 * One `ToPropertyKey`, at the door (#1843).
 *
 * A dependency name is used as a PROPERTY KEY, so every bare
 * `store[name]` / `Object.hasOwn(store, name)` is a `toString` call into
 * application code — and `set` made three of them, `remove` two. Nothing pinned
 * the result between them, so the key that was CHECKED was not the key that was
 * written or deleted. Measured through the public API with a name answering
 * `"alpha"` then `"beta"`: `remove` reported nothing (the check found `alpha`)
 * and deleted `beta`; `set` took the overwrite arm on `alpha` — skipping the
 * new-key limit check — and then added `beta`.
 *
 * The rule is core's own, from `src/engine/CLAUDE.md`: *"a guard that admits by
 * a computed key must hand the KEY downstream, never the value it computed it
 * from"*. This file already applies it one level up — `setDependency` captures
 * `store.dependencies` ONCE (#1859) because a validator warning can reach
 * application code that replaces it. The reference was pinned; the key was not.
 *
 * ⚠ A SYMBOL is handed back untouched, and that exemption loses nothing: a
 * symbol already IS a property key, so `ToPropertyKey` is the identity on it and
 * no application code runs — the entire hazard is the non-symbol case. Coercing
 * it instead was written first and measured: `set` and `remove` moved to
 * `"Symbol(svc)"` while `has` and `get` kept asking the symbol, so `set(S, 1)`
 * followed by `has(S)` answered **false**. That is a NEW divergence, in a family
 * that is merely incomplete today: a symbol key works through all four doors and
 * comes back from `getAll` (a spread carries own enumerable symbols), but
 * `Object.keys` does not see it, so `validateDependencyCount` never counts one
 * against the limit. Read-count is this fix's subject; symbol support is not,
 * and `set` narrows to `& string` anyway.
 *
 * ⚠ The parameter is `unknown` deliberately. Written as `String(name: string)`,
 * BOTH `@typescript-eslint/no-unnecessary-type-conversion` and
 * `unicorn/no-useless-coercion` reason from the declared type and autofix the
 * coercion away — measured on #1882, where `lint --fix` deleted the same fix
 * twice. `unknown` makes the conversion genuine, so no rule has anything to
 * remove and no disable comment is needed.
 */
const asKey = (name: unknown): string | symbol =>
  typeof name === "symbol" ? name : String(name);

// =============================================================================
// Module-private CRUD functions
// =============================================================================

function setDependency(
  store: DependenciesStore,
  dependencyName: string,
  dependencyValue: unknown,
  validator?: RouterValidator | null,
): void {
  // undefined = "don't set" (feature for conditional setting)
  if (dependencyValue === undefined) {
    return;
  }

  // ⚑ Captured ONCE, and this is the whole re-entrancy defence (#1859).
  //
  // `validateDependencyCount` and `warnOverwrite` both reach `logger.warn`, i.e.
  // the application's own `LoggerConfig.callback` — public `RouterOptions` API,
  // called synchronously between the reads above and the write below. That
  // callback can `dispose()` or `reset()` the router, and both clear this channel
  // by REPLACING `store.dependencies`. Re-reading the slot afterwards wrote into
  // the fresh post-teardown object, which every clear path then refused to touch
  // (they all `throwIfDisposed` first) while `getAll()` kept answering with it.
  //
  // Holding the reference makes that unreachable rather than merely guarded: the
  // write lands in the object the teardown discarded, so it is garbage by
  // construction. A per-call disposal probe cannot do this — there is a user-code
  // window on either side of it, and it would have to sit in both.
  // ⚠ `PropertyKey`, not `string`: a symbol dependency name reaches here
  // untouched (see `asKey`), and `Record<string, unknown>` would force a
  // `name as string` cast that is simply false about symbols.
  const target = store.dependencies as Record<PropertyKey, unknown>;
  // ⚑ Pinned for the same reason `target` is, one line up (#1843). The four
  // uses below asked the name FOUR times, and each was a `ToPropertyKey` call
  // into application code.
  const key = asKey(dependencyName);
  const isNewKey = !hasOwn(target, key);

  if (isNewKey) {
    // Only check limit when adding new keys (overwrites don't increase count)
    validator?.dependencies.validateDependencyCount(store, "setDependency");
  } else {
    const oldValue = target[key];
    const isChanging = oldValue !== dependencyValue;
    // Special case for NaN idempotency (NaN !== NaN is always true)
    const bothAreNaN = Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

    if (isChanging && !bothAreNaN) {
      // `String` again, and only here: the validator wants a name for a
      // MESSAGE, and this is the opt-in diagnostic path.
      validator?.dependencies.warnOverwrite(String(key), "setDependency");
    }
  }

  target[key] = dependencyValue;
}

function setMultipleDependencies(
  store: DependenciesStore,
  deps: Record<string, unknown>,
  validator?: RouterValidator | null,
): void {
  const overwrittenKeys: string[] = [];

  // ⚑ Captured ONCE — see `setDependency` above for the mechanism. This loop has
  // TWO user-code windows per key, not one: reading `deps[key]` runs an accessor
  // if the caller supplied one, and `validateDependencyCount` reaches
  // `logger.warn` → the application's `LoggerConfig.callback`. A disposal probe
  // between them closes the first and leaves the second open — measured, the
  // callback route reproduced the leak in full on a bag with no accessors at all.
  // Holding the reference closes both, and closes `reset()` (which replaces the
  // same slot) with them.
  const target = store.dependencies as Record<string, unknown>;

  // ⚑ The same walk as the constructor door — and "the same" is now literal
  // rather than approximate: both go through `ingestDependencies` (#1860), the
  // ONE door a caller-supplied bag passes, which judges and copies in a SINGLE
  // pass (#1861). Before this, `setAll` reached no structural check at all: a
  // string, an array, a class instance, a `Map` and an own enumerable getter all
  // went straight in, the last of them RUNNING the caller's code.
  ingestDependencies(deps, (key, value) => {
    if (hasOwn(target, key)) {
      overwrittenKeys.push(key);
    } else {
      validator?.dependencies.validateDependencyCount(store, "setDependencies");
    }

    // ⚑ The destination is the dependency store, built with `Object.create(null)`
    // (`dependenciesStore`), so there is no inherited setter for `"__proto__"` to
    // dispatch into: the key lands as an ordinary own property. That is the
    // exemption the SAST rule's own message names, and it is load-bearing rather
    // than incidental — `set("__proto__", v)` is a supported call whose value
    // `has`/`get` return, and `getAll()` is the door that withholds it on the way
    // out (#1823).
    // nosemgrep: unguarded-computed-key-write
    target[key] = value;
  });

  if (overwrittenKeys.length > 0) {
    validator?.dependencies.warnBatchOverwrite(
      overwrittenKeys,
      "setDependencies",
    );
  }
}

// =============================================================================
// Public API factory
// =============================================================================

export function getDependenciesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): DependenciesApi<Dependencies> {
  const ctx = getInternals(router);

  return {
    get: (name) => {
      ctx.validator?.dependencies.validateDependencyName(name, "getDependency");

      const store = ctx.dependenciesGetStore();
      const value = (store.dependencies as Record<string, unknown>)[
        name as string
      ];

      ctx.validator?.dependencies.validateDependencyExists(
        name as string,
        store,
      );

      return value as Dependencies[typeof name];
    },
    getAll: () => {
      // ⚑ A spread, then `dropUnsafeKey` (#1823 / #1957). The store is
      // `Object.create(null)`, so an own `"__proto__"` is an ORDINARY key there
      // — but a spread re-defines it on a normal object, and the result is then
      // a prototype-swap primitive for any consumer that merges it with
      // `Object.assign` or a `for…in` copy. `cloneRouter` spreads and is safe;
      // a consumer merging is not, and this is published API.
      //
      // ⚠ Asymmetric with `get("__proto__")`, deliberately: the single read
      // hands back a value, this door hands back a CONTAINER that someone will
      // merge. Same asymmetry the route-config records already carry.
      const source = ctx.dependenciesGetStore().dependencies as Record<
        string,
        unknown
      >;
      // ⚑ SPREAD, not a write loop, and the difference is the whole point of
      // this function. A spread DEFINES each key; `all[key] = value` SETS it,
      // and a `[[Set]]` of an ordinary dependency name that `Object.prototype`
      // happens to carry as an accessor throws instead of storing (#1852). The
      // first draft of this fix used the loop and turned an already-immune site
      // into a member of that class — measured, `getAll()` threw.
      //
      // The one key a spread cannot be trusted with: `source` is built with
      // `Object.create(null)`, so `"__proto__"` can sit there as an ORDINARY own
      // key. Spreading defines it as an own key here too — harmless in `all`
      // itself, but it makes the returned object a prototype-swap primitive for
      // any consumer that merges it with `Object.assign` or a `for…in` copy.
      //
      // ⚠ The delete is UNCONDITIONAL, and `dropUnsafeKey`'s docblock carries
      // the measurement that says why (a `hasOwn` gate in front of the one line
      // that neutralises the hazard is an intrinsic read an application can
      // re-point). This site is where that reasoning was FOUND (#1823); it now
      // serves three doors (#1957) and lives with the primitive.
      const all: Record<string, unknown> = dropUnsafeKey({ ...source });

      return all as ReturnType<DependenciesApi<Dependencies>["getAll"]>;
    },
    set: (name, value) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.dependencies.validateSetDependencyArgs(
        name,
        value,
        "setDependency",
      );

      setDependency(ctx.dependenciesGetStore(), name, value, ctx.validator);

      // ⚑ Again, AFTER the write (#1859). The guard above answers "was the
      // router alive when you called?"; this one answers "was it still alive
      // when the write landed?". Between them sit `validateDependencyCount` and
      // `warnOverwrite`, which reach `logger.callback` — the application's own
      // code. The write itself is already harmless (the target is captured, so a
      // teardown mid-call sends it to the discarded object); this is what stops
      // the call REPORTING success for a store that no longer exists.
      throwIfDisposed(ctx.isDisposed);
    },
    setAll: (deps) => {
      throwIfDisposed(ctx.isDisposed);

      const store = ctx.dependenciesGetStore();

      ctx.validator?.dependencies.validateDependenciesObject(
        deps,
        "setDependencies",
      );

      setMultipleDependencies(
        store,
        deps as Record<string, unknown>,
        ctx.validator,
      );

      // ⚑ See `set` above — same reason, same placement.
      throwIfDisposed(ctx.isDisposed);
    },
    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.dependencies.validateDependencyName(
        name,
        "removeDependency",
      );

      const store = ctx.dependenciesGetStore();
      // ⚑ One coercion (#1843) — the check and the delete asked separately, so
      // a name answering `"alpha"` then `"beta"` reported nothing and deleted
      // `beta`.
      const key = asKey(name);

      if (!hasOwn(store.dependencies, key)) {
        ctx.validator?.dependencies.warnRemoveNonExistent(String(key));
      }

      delete (store.dependencies as Record<PropertyKey, unknown>)[key];
    },
    reset: () => {
      throwIfDisposed(ctx.isDisposed);
      const store = ctx.dependenciesGetStore();

      store.dependencies = objectCreate(null) as Partial<Dependencies>;
    },
    has: (name) => {
      ctx.validator?.dependencies.validateDependencyName(name, "hasDependency");

      return hasOwn(ctx.dependenciesGetStore().dependencies, name);
    },
  };
}
