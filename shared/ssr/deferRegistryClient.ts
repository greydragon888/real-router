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
  const g = getGlobal();
  let registry = g[REGISTRY_GLOBAL_KEY];

  if (registry === undefined) {
    registry = new Map<string, RegistryEntry>();
    g[REGISTRY_GLOBAL_KEY] = registry;
  }

  return registry;
}

/**
 * Returns the registered Promise for `key`, creating a fresh pending entry on
 * first access. Stable across calls — `useDeferred` relies on Promise
 * reference identity for React `use()` to track resolution.
 */
export function ensureRegistryPromise(key: string): Promise<unknown> {
  const registry = getOrCreateRegistry();
  let entry = registry.get(key);

  if (entry === undefined) {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;

    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    entry = { promise, resolve, reject };
    registry.set(key, entry);
  }

  return entry.promise;
}

/** Test-only — clears the global registry. Not exported from index.ts. */
export function __resetRegistryForTests(): void {
  const g = getGlobal();
  delete g[REGISTRY_GLOBAL_KEY];
  delete g[SETTLE_FN_NAME];
  delete g[REJECT_FN_NAME];
}
