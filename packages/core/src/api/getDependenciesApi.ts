import {
  clearDependencies,
  readDependency,
  snapshotDependencies,
  storeDependency,
} from "../dependenciesStore";
import { ingestDependencies } from "../guards";
import {
  DIAGNOSTIC,
  POSITION,
  getInternals,
  hasChecks,
  runChecks,
  throwIfDisposed,
} from "../internals";

import type { DependenciesApi } from "./types";
import type { DependenciesStore } from "../dependenciesStore";
import type { RouterInternals } from "../internals";
import type { DefaultDependencies, Router } from "../types";

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
const objectKeys = Object.keys;

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
 * `store.dependencies` ONCE (#1859) because its count check and reports can run
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
 * `Object.keys` does not see it, so the count the count positions receive
 * never includes one. Read-count is this fix's subject; symbol support is not,
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

/** The held-key list bare core asks: no check and no handler reads the answer. */
const NO_HELD_KEYS: readonly string[] = [];

// =============================================================================
// Module-private CRUD functions
// =============================================================================

function setDependency(
  store: DependenciesStore,
  checks: RouterInternals["checks"],
  dependencyName: string,
  dependencyValue: unknown,
): void {
  // undefined = "don't set" (feature for conditional setting)
  if (dependencyValue === undefined) {
    return;
  }

  // ⚑ Captured ONCE, and this is the whole re-entrancy defence (#1859).
  //
  // The count check and the reports of this door run application code between
  // this read and the write below: a check or a diagnostic handler directly,
  // and through the logger the application's own `LoggerConfig.callback` —
  // public `RouterOptions` API. That code can `dispose()` or `reset()` the
  // router, and both clear this channel by REPLACING `store.dependencies`.
  // Re-reading the slot afterwards would write into the fresh object: after
  // `dispose()`, one that every clear path refuses to touch (they all
  // `throwIfDisposed` first) while `getAll()` keeps answering with it; after
  // `reset()`, one the count check never judged.
  //
  // Holding the reference makes that unreachable rather than merely guarded: the
  // write lands in the object the teardown discarded, so it is garbage by
  // construction. A per-call disposal probe cannot do this — there is a user-code
  // window on either side of it, and it would have to sit in both.
  // ⚠ `PropertyKey`, not `string`: a symbol dependency name reaches here
  // untouched (see `asKey`), and `Record<string, unknown>` would force a
  // `name as string` cast that is simply false about symbols.
  const target = store.dependencies as Record<PropertyKey, unknown>;
  // ⚑ Pinned for the same reason `target` is (#1843). Unpinned, every use below
  // that coerces the name would run its `toString` again.
  const key = asKey(dependencyName);

  const { diagnostics } = store;

  // ⚑ ONE question about the record's keys (#1815 / #2064): the count the limit
  // judges and the membership that decides whether this write ADDS a key come
  // from the same list, so they cannot disagree about a key the count does not
  // see. Whoever reads the answer — a check at the count position, a handler of
  // the count kind, a handler of the overwrite kind — is asked on its own, so
  // any one of them alone gets the real list. Bare core asks an empty one.
  const heldKeys: readonly PropertyKey[] =
    hasChecks(checks, POSITION["setDependency:count"]) ||
    diagnostics.listenerCount(DIAGNOSTIC.SET_DEPENDENCY_COUNT) > 0 ||
    diagnostics.listenerCount(DIAGNOSTIC.SET_DEPENDENCY_OVERWRITE) > 0
      ? objectKeys(target)
      : NO_HELD_KEYS;

  if (heldKeys.includes(key)) {
    const oldValue = target[key];
    const isChanging = oldValue !== dependencyValue;
    // Special case for NaN idempotency (NaN !== NaN is always true)
    const bothAreNaN = Number.isNaN(oldValue) && Number.isNaN(dependencyValue);

    if (isChanging && !bothAreNaN) {
      // `String` again, and only here: the report wants a name for a MESSAGE.
      // `heldKeys` holds strings alone, so this arm never meets a symbol.
      diagnostics.emit(DIAGNOSTIC.SET_DEPENDENCY_OVERWRITE, String(key));
    }
  } else {
    // Only a NEW key is counted: an overwrite leaves the count unchanged. The
    // check refuses first, so a refused write reports nothing.
    runChecks(
      checks,
      POSITION["setDependency:count"],
      heldKeys.length,
      store.limits.maxDependencies,
    );
    diagnostics.emit(
      DIAGNOSTIC.SET_DEPENDENCY_COUNT,
      heldKeys.length,
      store.limits.maxDependencies,
    );
  }

  target[key] = dependencyValue;
}

function setMultipleDependencies(
  store: DependenciesStore,
  checks: RouterInternals["checks"],
  deps: Record<string, unknown>,
): void {
  const overwrittenKeys: string[] = [];

  // ⚑ Captured ONCE — see `setDependency` above for the mechanism. This loop has
  // TWO user-code windows per key, not one: reading `deps[key]` runs a `get`
  // trap if the caller handed in a `Proxy`, and the count check and the count
  // report run application code — directly, and through the logger the
  // application's `LoggerConfig.callback`. A disposal probe between them closes
  // the first and leaves the second open — measured, the callback route
  // reproduced the leak in full on a bag with no accessors at all. Holding the
  // reference closes both, and closes `reset()` (which replaces the same slot)
  // with them.
  const target = store.dependencies as Record<string, unknown>;
  const { diagnostics } = store;

  // ⚑ The same walk as the constructor door — and "the same" is now literal
  // rather than approximate: both go through `ingestDependencies` (#1860), the
  // ONE door a caller-supplied bag passes, which judges and copies in a SINGLE
  // pass (#1861). Before this, `setAll` reached no structural check at all: a
  // string, an array, a class instance, a `Map` and an own enumerable getter all
  // went straight in, the last of them RUNNING the caller's code.
  // ⚑ ONE list of held keys (#1815 / #2064), read once per call and grown as the
  // loop admits keys: the count and the membership test both come from it. Its
  // readers are `setDependency`'s, each asked on its own, at this door's
  // position and kinds; bare core starts it empty.
  const held = new Set(
    hasChecks(checks, POSITION["setDependencies:count"]) ||
      diagnostics.listenerCount(DIAGNOSTIC.SET_DEPENDENCIES_COUNT) > 0 ||
      diagnostics.listenerCount(DIAGNOSTIC.SET_DEPENDENCIES_OVERWRITE) > 0
      ? objectKeys(target)
      : NO_HELD_KEYS,
  );

  ingestDependencies(deps, (key, value) => {
    if (held.has(key)) {
      overwrittenKeys.push(key);
    } else {
      runChecks(
        checks,
        POSITION["setDependencies:count"],
        held.size,
        store.limits.maxDependencies,
      );
      diagnostics.emit(
        DIAGNOSTIC.SET_DEPENDENCIES_COUNT,
        held.size,
        store.limits.maxDependencies,
      );
      held.add(key);
    }

    storeDependency(target, key, value);
  });

  if (overwrittenKeys.length > 0) {
    diagnostics.emit(DIAGNOSTIC.SET_DEPENDENCIES_OVERWRITE, overwrittenKeys);
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
      runChecks(ctx.checks, POSITION["getDependency:entry"], name);

      const store = ctx.dependenciesGetStore();
      const value = readDependency(store, name);

      runChecks(ctx.checks, POSITION["getDependency:value"], name, value);

      return value;
    },
    getAll: () => {
      // ⚠ Asymmetric with `get("__proto__")`, deliberately: the single read
      // hands back a value, this door hands back a CONTAINER that someone will
      // merge. `snapshotDependencies` owns what it withholds and why.
      return snapshotDependencies(ctx.dependenciesGetStore()) as ReturnType<
        DependenciesApi<Dependencies>["getAll"]
      >;
    },
    set: (name, value) => {
      throwIfDisposed(ctx.isDisposed);

      runChecks(ctx.checks, POSITION["setDependency:entry"], name, value);

      // ⚑ Again, between the check and the record (#1859). The check is
      // application code: one that disposes the router ends the call here,
      // before anything is written, and one that resets it leaves the call as
      // `reset()` followed by the write.
      throwIfDisposed(ctx.isDisposed);

      setDependency(ctx.dependenciesGetStore(), ctx.checks, name, value);

      // ⚑ Again, AFTER the write (#1859). The first guard answers "was the
      // router alive when you called?"; this one answers "was it still alive
      // when the write landed?". Between them sit this door's checks and
      // reports, which run the application's own code. A teardown after the
      // record is taken — in the name's `toString`, the count check or a
      // report — sends the write to the discarded object, so the write itself
      // is harmless; this is what stops the call REPORTING success for a store
      // that no longer exists.
      throwIfDisposed(ctx.isDisposed);
    },
    setAll: (deps) => {
      throwIfDisposed(ctx.isDisposed);

      runChecks(ctx.checks, POSITION["setDependencies:entry"], deps);

      // ⚑ This guard and the last one: see `set` above.
      throwIfDisposed(ctx.isDisposed);

      setMultipleDependencies(
        ctx.dependenciesGetStore(),
        ctx.checks,
        deps as Record<string, unknown>,
      );

      throwIfDisposed(ctx.isDisposed);
    },
    remove: (name) => {
      throwIfDisposed(ctx.isDisposed);

      runChecks(ctx.checks, POSITION["removeDependency:entry"], name);

      const store = ctx.dependenciesGetStore();
      // ⚑ One coercion (#1843) — the check and the delete asked separately, so
      // a name answering `"alpha"` then `"beta"` reported nothing and deleted
      // `beta`.
      const key = asKey(name);

      // ⚑ No capture, unlike `set`: this door stores no value, so a check or a
      // report that tears the router down strands none, and the delete below
      // acts on whichever record is live.
      if (!hasOwn(store.dependencies, key)) {
        store.diagnostics.emit(DIAGNOSTIC.REMOVE_DEPENDENCY_MISSING, key);
      }

      delete (store.dependencies as Record<PropertyKey, unknown>)[key];

      // ⚑ Again, after the delete, as in `set`: the check and the report run
      // application code, and this stops the call reporting success on a
      // router they disposed.
      throwIfDisposed(ctx.isDisposed);
    },
    reset: () => {
      throwIfDisposed(ctx.isDisposed);
      clearDependencies(ctx.dependenciesGetStore());
    },
    has: (name) => {
      runChecks(ctx.checks, POSITION["hasDependency:entry"], name);

      return hasOwn(ctx.dependenciesGetStore().dependencies, name);
    },
  };
}
