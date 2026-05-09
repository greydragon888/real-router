/**
 * Marker symbol for `defer()` payloads. `Symbol.for` is used so the brand
 * survives across multiple module instances (a real concern in monorepo setups
 * with multiple `node_modules/@real-router/ssr-data-plugin` copies).
 */
export const DEFER_BRAND: unique symbol = Symbol.for(
  "@real-router/ssr-data-plugin/defer",
);

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
>(options: { readonly critical: C; readonly deferred: D }): DeferredPayload<
  C,
  D
> {
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      "[defer] expected an object with `critical` and `deferred` fields",
    );
  }

  if (
    options.deferred === null ||
    typeof options.deferred !== "object" ||
    Array.isArray(options.deferred)
  ) {
    throw new TypeError(
      "[defer] `deferred` must be a non-null, non-array object of promises",
    );
  }

  for (const [key, value] of Object.entries(options.deferred)) {
    // Reserved keys would corrupt the prototype chain when the client-side
    // plugin reconstructs the deferred map via `[key] = ensureRegistryPromise(key)`.
    // The reconstruction path uses a null-prototype object as a defence-in-depth
    // measure, but rejecting these keys upstream keeps the wire-format
    // symmetric (server-side payload === client-side reconstruction).
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
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
      (value as Promise<unknown>).catch(() => {
        /* no-op — see comment above */
      });
    }
  }

  // Freeze a *shallow clone* of the deferred map (rather than the user's
  // own reference) so:
  //   1. `Object.freeze` doesn't surprise the caller by freezing an object
  //      they still hold a reference to.
  //   2. Post-`defer()` mutations to the user's original map (e.g.
  //      `userMap.evil = somePromise`) cannot smuggle in entries that
  //      bypass the validation/`.catch` loop above. Without this, a late
  //      `userMap.__proto__ = …` or an eagerly-rejected promise added
  //      after this call would land in `injectDeferredScripts` unchecked.
  // The clone is shallow — promise references are preserved, so the
  // settle pipeline observes the same Promise instances the validator
  // examined.
  return Object.freeze({
    critical: options.critical,
    deferred: Object.freeze({ ...options.deferred }) as D,
    [DEFER_BRAND]: true,
  });
}

/** Type guard — `true` iff `value` is a payload returned by `defer()`. */
export function isDeferred(
  value: unknown,
): value is DeferredPayload<unknown, Record<string, Promise<unknown>>> {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<symbol, unknown>)[DEFER_BRAND] === true
  );
}
