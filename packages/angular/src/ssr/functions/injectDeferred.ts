import { computed, effect, signal } from "@angular/core";

import { injectRoute } from "@real-router/angular";

import type { Signal } from "@angular/core";

interface DeferredContext {
  ssrDataDeferred?: Record<string, Promise<unknown>>;
}

const NEVER_PROMISE = new Promise<never>(() => {
  // Intentionally never resolves — settles as `undefined` indefinitely when
  // a key is requested that the loader never declared. Surfaces consumer/
  // loader key drift as a visible "loading" state in the UI.
});

/**
 * Read a deferred promise published by `defer({ deferred: { <key>: Promise } })`
 * inside an SSR data loader. Returns an Angular `Signal<T | undefined>` that
 * tracks the active route — re-keying picks up the new state's deferred map.
 *
 * The signal starts `undefined` and updates to the resolved value once the
 * promise settles. Use with native Angular control flow:
 *
 * ```ts
 * @Component({
 *   template: `
 *     @if (reviews()) {
 *       <ul>
 *         @for (r of reviews(); track r.id) {
 *           <li>{{ r.author }}</li>
 *         }
 *       </ul>
 *     } @else {
 *       <p>Loading reviews…</p>
 *     }
 *   `,
 * })
 * export class Reviews {
 *   readonly reviews = injectDeferred<Review[]>("reviews");
 * }
 * ```
 *
 * **Asymmetric Angular** (see `.claude/SSR_FEATURE_GAPS_RU.md` §8): Angular
 * does not ship `<Await>` / `<Streamed>` adapter components — Angular has no
 * direct analogue to React's `use(promise)` or Svelte's `{#await}`. Use
 * `@if (signal()) { … } @else { … }` or the `async` pipe with
 * `from(deferredPromise)` instead.
 */
export function injectDeferred<T = unknown>(
  key: string,
): Signal<T | undefined> {
  const { routeState } = injectRoute();

  // Re-derive the promise reference whenever the route changes — invalidate()
  // + reload, navigation to a new route, etc. all refresh the underlying
  // deferred map, and we want the signal to track the *latest* promise.
  const promiseSignal = computed<Promise<T>>(() => {
    const context = routeState().route.context as DeferredContext;
    const deferred = context.ssrDataDeferred;

    return (deferred?.[key] ?? NEVER_PROMISE) as Promise<T>;
  });

  const value = signal<T | undefined>(undefined);

  effect((onCleanup) => {
    const promise = promiseSignal();
    let cancelled = false;

    onCleanup(() => {
      cancelled = true;
    });

    promise.then(
      (resolved) => {
        if (!cancelled) {
          value.set(resolved);
        }
      },
      /* v8 ignore next 4 -- @preserve: rejection branch — `effect` swallows
         async errors silently, so leaving the signal as `undefined` is the
         only observable behaviour. Real error surfacing is the loader's
         responsibility (throw → navigation rejects → app error boundary). */
      () => {
        // Intentional swallow — see v8 ignore note above.
      },
    );
  });

  return value.asReadonly();
}
