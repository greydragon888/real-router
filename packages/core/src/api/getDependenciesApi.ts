import { throwIfDisposed } from "./helpers";
import { UNSAFE_KEY } from "../constants";
import { getInternals } from "../internals";

import type { DependenciesApi } from "./types";
import type { DependenciesStore } from "../namespaces";
import type { DefaultDependencies, Router } from "../types";
import type { RouterValidator } from "../types/RouterValidator";

/**
 * Captured at module load, for the same reason `guards` and `dependenciesStore`
 * capture theirs: a guard is only as strong as the intrinsic it reads WHEN IT
 * RUNS. ⚠ It does not close a shim evaluated BEFORE this module.
 *
 * The bare `Object.hasOwn` calls elsewhere in this file read the STORE, which is
 * `Object.create(null)` — a re-pointed `hasOwn` misreports there too, but the
 * store's contents are the router's own, not a caller's bag.
 */
const objectKeys = Object.keys;

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

  const isNewKey = !Object.hasOwn(store.dependencies, dependencyName);

  if (isNewKey) {
    // Only check limit when adding new keys (overwrites don't increase count)
    validator?.dependencies.validateDependencyCount(store, "setDependency");
  } else {
    const oldValue = (store.dependencies as Record<string, unknown>)[
      dependencyName
    ];
    const isChanging = oldValue !== dependencyValue;
    // Special case for NaN idempotency (NaN !== NaN is always true)
    const bothAreNaN = Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

    if (isChanging && !bothAreNaN) {
      validator?.dependencies.warnOverwrite(dependencyName, "setDependency");
    }
  }

  (store.dependencies as Record<string, unknown>)[dependencyName] =
    dependencyValue;
}

function setMultipleDependencies(
  store: DependenciesStore,
  deps: Record<string, unknown>,
  validator?: RouterValidator | null,
): void {
  const overwrittenKeys: string[] = [];

  // ⚑ The same walk and the same single read as the constructor door — and
  // "the same" is literal, not approximate: both call the captured
  // `objectKeys`. See `dependenciesStore` for why `for…in` + `Object.hasOwn`
  // is not an equivalent spelling.
  for (const key of objectKeys(deps)) {
    const value = deps[key];

    if (value === undefined) {
      continue;
    }

    if (Object.hasOwn(store.dependencies, key)) {
      overwrittenKeys.push(key);
    } else {
      validator?.dependencies.validateDependencyCount(store, "setDependencies");
    }

    (store.dependencies as Record<string, unknown>)[key] = value;
  }

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
      // ⚑ A spread, then `UNSAFE_KEY` deleted (#1823). The store is
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
      const all: Record<string, unknown> = { ...source };

      // The one key a spread cannot be trusted with: `source` is built with
      // `Object.create(null)`, so `"__proto__"` can sit there as an ORDINARY own
      // key. Spreading defines it as an own key here too — harmless in `all`
      // itself, but it makes the returned object a prototype-swap primitive for
      // any consumer that merges it with `Object.assign` or a `for…in` copy.
      //
      // ⚠ UNCONDITIONAL, and deliberately. Guarding it with
      // `Object.hasOwn(source, UNSAFE_KEY)` decides nothing — deleting an
      // absent key is a no-op in every observable respect, measured — while
      // putting a re-pointable intrinsic read in front of the one line that
      // neutralises the hazard. `hasOwn` shimmed to `false` restored the whole
      // primitive.
      delete all[UNSAFE_KEY];

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
    },
    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      ctx.validator?.dependencies.validateDependencyName(
        name,
        "removeDependency",
      );

      const store = ctx.dependenciesGetStore();

      if (!Object.hasOwn(store.dependencies, name)) {
        ctx.validator?.dependencies.warnRemoveNonExistent(name);
      }

      delete (store.dependencies as Record<string, unknown>)[name as string];
    },
    reset: () => {
      throwIfDisposed(ctx.isDisposed);
      const store = ctx.dependenciesGetStore();

      store.dependencies = Object.create(null) as Partial<Dependencies>;
    },
    has: (name) => {
      ctx.validator?.dependencies.validateDependencyName(name, "hasDependency");

      return Object.hasOwn(ctx.dependenciesGetStore().dependencies, name);
    },
  };
}
