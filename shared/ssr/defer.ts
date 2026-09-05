/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — they answer "what is on this object" for a value this module
 * did not build. Read off the live global they can be re-pointed after boot, and
 * `shared/` is the half where that fails OPEN: measured in `browser-env`, a
 * re-pointed `getPrototypeOf` admits a `Date` into `state.params` and a
 * re-pointed `keys` skips option validation entirely.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;

/**
 * Marker symbol for `defer()` payloads. `Symbol.for` is used so the brand
 * survives across multiple module instances (a real concern in monorepo setups
 * with multiple `node_modules/@real-router/ssr-data-plugin` copies).
 */
export const DEFER_BRAND: unique symbol = Symbol.for(
  "@real-router/ssr-data-plugin/defer",
);

/**
 * Keys `defer()` refuses in `deferred`. The reconstruction path uses a
 * null-prototype object as defence in depth; refusing them here keeps the wire
 * format symmetric (server payload === client reconstruction).
 */
const RESERVED_DEFER_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export interface DeferredPayload<
  C,
  D extends Record<string, Promise<unknown>>,
> {
  readonly critical: C;
  readonly deferred: D;
  readonly [DEFER_BRAND]: true;
}

/**
 * Wraps a loader return value to declare a critical/deferred split.
 *
 * - `critical` resolves before HTML render (blocks the shell).
 * - `deferred` is a record of named promises that the framework can stream
 *   independently — `<Suspense>`, `<Await/>`, `{#await}`, etc.
 *
 * The plugin writes `critical` to `state.context.<namespace>` (e.g. `data`)
 * and the deferred promises to `state.context.<namespace>Deferred` (e.g.
 * `ssrDataDeferred`). Adapter-side `useDeferred(key)` reads from the same
 * shape and returns the matching promise for native framework awaiting.
 *
 * On the server: `state.context.ssrDataDeferred[key]` is the actual promise
 * the loader produced. On the client (post-hydration): the plugin reconstructs
 * promises from the global `__rrDeferRegistry__` that inline `__rrDefer__()`
 * scripts populate as the server stream lands.
 */
export function defer<
  const C,
  const D extends Record<string, Promise<unknown>>,
>(options: {
  readonly critical: C;
  readonly deferred: D;
}): DeferredPayload<C, D> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `defer` is a PUBLIC export of @real-router/ssr-data-plugin, so the parameter type binds TypeScript callers and nobody else; a JS consumer or an `any`-typed call reaches this with anything.
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      "[defer] expected an object with `critical` and `deferred` fields",
    );
  }

  // ⚑ ONE read of `options.deferred`, and ONE `[[Get]]` per key (#1914). Every
  // check below and the payload built at the end run against THIS object, so
  // the value that is validated is the value that ships. An accessor-backed bag
  // — the natural spelling of a lazy deferred value — otherwise answers the
  // validation loop and the payload separately.
  const source: unknown = options.deferred;

  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError(
      "[defer] `deferred` must be a non-null, non-array object of promises",
    );
  }

  const snapshot = { ...(source as Record<string, unknown>) };

  for (const [key, value] of objectEntries(snapshot)) {
    // Reserved keys would corrupt the prototype chain when the client-side
    // plugin reconstructs the deferred map via `[key] = ensureRegistryPromise(key)`.
    // The reconstruction path uses a null-prototype object as a defence-in-depth
    // measure, but rejecting these keys upstream keeps the wire-format
    // symmetric (server-side payload === client-side reconstruction).
    if (RESERVED_DEFER_KEYS.has(key)) {
      throw new TypeError(
        `[defer] \`deferred.${key}\` is reserved — choose a different key`,
      );
    }

    if (
      value === null ||
      typeof value !== "object" ||
      typeof (value as { then?: unknown }).then !== "function"
    ) {
      throw new TypeError(
        `[defer] \`deferred.${key}\` must be a Promise (got ${typeof value})`,
      );
    }

    // Defensive sibling-handler: an eagerly-rejected promise (e.g.
    // `Promise.reject(new Error(...))` synchronously inside the loader)
    // races the server-side `injectDeferredScripts` `.then(...)`
    // attachment. Without a handler attached at construction time, Node
    // emits an `unhandledRejection` warning before the wire-format
    // settler can register. The no-op `.catch` does not consume the
    // rejection — it only marks the promise as "handled" for Node's
    // tracker, so the real settler still observes the rejection and
    // emits the `__rrDeferError__` script.
    //
    // Duck-typed thenables (no `.catch`) are skipped: Node's
    // unhandledRejection tracker only fires for native Promise objects,
    // so non-Promise thenables don't need the suppression anyway.
    const maybeCatch = (value as { catch?: unknown }).catch;

    if (typeof maybeCatch === "function") {
      // Called on the snapshot's own value — the same object the payload
      // freezes, which is what makes this handler cover the promise that ships.
      (value as Promise<unknown>).catch(() => {
        /* no-op — see comment above */
      });
    }
  }

  // The payload freezes the SNAPSHOT the loop above validated, not the caller's
  // reference:
  //   1. `Object.freeze` doesn't surprise the caller by freezing an object
  //      they still hold a reference to.
  //   2. Post-`defer()` mutations to the user's original map (e.g.
  //      `userMap.evil = somePromise`) cannot smuggle in entries that
  //      bypass the validation/`.catch` loop above. Without this, a late
  //      `userMap.__proto__ = …` or an eagerly-rejected promise added
  //      after this call would land in `injectDeferredScripts` unchecked.
  // The snapshot is shallow — promise references are preserved, so the settle
  // pipeline observes the same Promise instances the validator examined and the
  // `.catch` was attached to.
  return freeze({
    critical: options.critical,
    deferred: freeze(snapshot),
    [DEFER_BRAND]: true,
  }) as DeferredPayload<C, D>;
}

/** Type guard — `true` iff `value` is a payload returned by `defer()`.
 *
 * The brand check uses `Object.hasOwn(value, DEFER_BRAND)` rather than a
 * plain property read so a prototype-chain inheritance bypass —
 * `Object.create({ [DEFER_BRAND]: true })` — does not falsely tag an
 * object as a deferred payload. The brand symbol is a `Symbol.for(...)`,
 * so a brand-marked object inherited by accident from a foreign realm
 * could otherwise sneak past `defer()`'s validation and reach
 * `createSsrLoaderPlugin`'s deferred branch with no `critical` / `deferred`
 * fields.
 *
 * ⚑ That branch refuses such a payload before it writes anything (#1835), so
 * the two checks are independent: this one keeps an inherited brand from
 * selecting the branch, that one keeps a selected branch from writing a
 * half-payload.
 */
export function isDeferred(
  value: unknown,
): value is DeferredPayload<unknown, Record<string, Promise<unknown>>> {
  return (
    value !== null &&
    typeof value === "object" &&
    hasOwn(value, DEFER_BRAND) &&
    (value as Record<symbol, unknown>)[DEFER_BRAND] === true
  );
}
