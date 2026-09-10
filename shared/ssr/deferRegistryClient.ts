/**
 * Client-side registry for deferred values streamed from the server.
 *
 * The contract spans three actors:
 *
 * 1. **Server stream injects `<script>__rrDefer__("key", "json")</script>`
 *    tags** as each loader-returned promise resolves. The bootstrap script
 *    (also server-emitted) installs `__rrDefer__` and the registry on
 *    `globalThis` before any settle script runs.
 *
 * 2. **Plugin start interceptor** (post-hydration scratchpad path) reads the
 *    `<deferredKeysNamespace>` list from the hydrated state, then calls
 *    `ensureRegistryPromise(key)` once per key to obtain the promise that
 *    `useDeferred()` will return. This ensures a stable Promise reference
 *    across the initial render and any inline-script settlements.
 *
 * 3. **Adapter `useDeferred(key)`** reads from `state.context.<deferredNamespace>`
 *    which the plugin populated above. The returned Promise integrates with
 *    React `use()`, Solid `<Await/>`, Svelte `{#await}`, etc.
 *
 * This module holds **only** the client-needed registry plumbing — no
 * server-only wire-format. `createSsrLoaderPlugin` (the client `.` graph)
 * imports `ensureRegistryPromise` from here, so the server-only escaping /
 * settle-script code in `deferWireFormat.ts` (with its impure module-level
 * `RegExp` / `Object.fromEntries` initialisers) never lands in the client
 * bundle (#761). The `<script>`-wire producers live in `deferWireFormat.ts`,
 * reached only from each plugin's `./server` entry.
 */

interface RegistryEntry {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  /**
   * The plugin instance that first asked for this key, when the caller supplied
   * one (#2061). Identity only — never read for anything but the comparison
   * below, so it cannot keep a router alive beyond the registry entry.
   */
  claimant?: object | undefined;
  /**
   * Set once the collision has been reported, so a key claimed by two routers
   * warns per KEY rather than per render.
   *
   * ⚠ It lives on the ENTRY, not in module state. A module-level `Set` is the
   * shape #1583 was filed for: process-global de-dup goes silent after the
   * first router under SSR/SSG, which for a diagnostic is exactly backwards.
   * Here the flag is cleared with the registry it belongs to.
   */
  collisionReported?: boolean | undefined;
}

/**
 * Global-key + settle/reject function names — the shared protocol between the
 * client registry (this module) and the server wire-format (`deferWireFormat.ts`,
 * which imports these). Kept here because the registry owns the global it reads;
 * the two server-only names tree-shake out of the client bundle (only
 * `__resetRegistryForTests` references them, and it is unreachable from `.`).
 */
export const REGISTRY_GLOBAL_KEY = "__rrDeferRegistry__";

export const SETTLE_FN_NAME = "__rrDefer__";

export const REJECT_FN_NAME = "__rrDeferError__";

interface DeferGlobal {
  [REGISTRY_GLOBAL_KEY]?: Map<string, RegistryEntry>;
  [SETTLE_FN_NAME]?: (key: string, json: string) => void;
  [REJECT_FN_NAME]?: (key: string, json: string) => void;
}

function getGlobal(): DeferGlobal {
  return globalThis as unknown as DeferGlobal;
}

function getOrCreateRegistry(): Map<string, RegistryEntry> {
  const scope = getGlobal();
  let registry = scope[REGISTRY_GLOBAL_KEY];

  if (registry === undefined) {
    registry = new Map<string, RegistryEntry>();
    scope[REGISTRY_GLOBAL_KEY] = registry;
  }

  return registry;
}

/**
 * Returns the registered Promise for `key`, creating a fresh pending entry on
 * first access. Stable across calls — `useDeferred` relies on Promise
 * reference identity for React `use()` to track resolution.
 *
 * ⚠ **The key namespace is page-global and belongs to the APPLICATION, not to
 * the plugin (#2061).** `defer({ deferred: { reviews } })` puts `"reviews"` on
 * `globalThis` for the whole document, so two routers on one page that declare
 * the same name share one entry — and therefore one promise object. Whichever
 * payload lands first resolves it for both, and the second router's
 * `useDeferred()` reads the first one's data.
 *
 * `claimant` makes that visible. Pass the per-plugin identity: the same one
 * asking again is the documented idempotent case and stays silent, a different
 * one warns.
 *
 * ⚠ **A diagnostic, not isolation, and deliberately so.** Handing the second
 * claimant its own promise would be worse than the collision: the settle script
 * carries the bare key and resolves exactly one entry, so the second promise
 * would never settle at all. Real isolation needs a per-router prefix in the
 * WIRE format, which needs an identity surviving SSR → client that
 * `SerializedRouterState` does not carry.
 */
export function ensureRegistryPromise(
  key: string,
  claimant?: object,
): Promise<unknown> {
  const registry = getOrCreateRegistry();
  let entry = registry.get(key);

  if (
    entry !== undefined &&
    claimant !== undefined &&
    entry.claimant !== undefined &&
    entry.claimant !== claimant &&
    entry.collisionReported !== true
  ) {
    entry.collisionReported = true;
    // The client registry has no logger in scope, and this is a page-level
    // misconfiguration a developer has to see.
    console.warn(
      `[real-router] Deferred key "${key}" is claimed by more than one router on this page. ` +
        `Deferred key names are page-global: both routers share one promise, and whichever ` +
        `payload arrives first resolves it for both. Give each router distinct key names.`,
    );
  }

  if (entry === undefined) {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;

    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- `Promise.withResolvers` is ES2024 and this module ships to the BROWSER (it is the client-side defer registry). Checked against MDN BCD: Chrome 119, Firefox 121, Safari 17.4 — so adopting it drops every Safari below 17.4 (March 2024). The repo declares no browser floor, so that is a product decision about supported runtimes, not a lint fix, and is deliberately left to the owner rather than taken as a side effect of turning this gate on (#1913).
    const promise = new Promise<unknown>((settle, fail) => {
      resolve = settle;
      reject = fail;
    });

    entry = { promise, resolve, reject, claimant };
    registry.set(key, entry);
  }

  return entry.promise;
}

/** Test-only — clears the global registry. Not exported from index.ts. */
export function __resetRegistryForTests(): void {
  const scope = getGlobal();

  delete scope[REGISTRY_GLOBAL_KEY];
  delete scope[SETTLE_FN_NAME];
  delete scope[REJECT_FN_NAME];
}
