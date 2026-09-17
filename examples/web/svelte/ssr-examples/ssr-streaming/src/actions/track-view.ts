// `use:` action — Svelte 5 directive that runs on the client only. The
// SSR runtime skips action invocations entirely (the function never gets
// called on the server), so it's safe to reference DOM-only APIs like
// `IntersectionObserver` and `window`. This is one of Svelte's cleaner
// SSR-safety guarantees: actions can't accidentally crash the server.
//
// Production analogue: send a "view" event to analytics when the
// observed element scrolls into the viewport. Here we append to a
// global array so an e2e test can read the log without mocking the
// actual analytics endpoint.
//
// Lifecycle:
//   - Mount: action(node, params) runs once
//   - Update: action.update(nextParams) runs whenever bound params
//     change reactively (productId in our case). The IntersectionObserver
//     instance survives — the closure captures `currentProductId` by
//     reference, so the next intersect event uses the updated value.
//   - Unmount: action.destroy() disconnects the observer
//
// We log update calls separately to `window.__VIEW_UPDATE_LOG__` so the
// e2e suite can verify the update path without forcing an
// IntersectionObserver fire (which is non-trivial in headless browsers
// without scroll). __VIEW_LOG__ tracks intersect events; __VIEW_UPDATE_LOG__
// tracks update lifecycle calls. Both contain the product id at the
// moment of the event, which is the assertion for the update test.

declare global {
  interface Window {
    __VIEW_LOG__?: { productId: string; ts: number }[];
    __VIEW_UPDATE_LOG__?: { productId: string; ts: number }[];
  }

  var __VIEW_LOG__: { productId: string; ts: number }[] | undefined;

  var __VIEW_UPDATE_LOG__: { productId: string; ts: number }[] | undefined;
}

/**
 * The e2e counters live on the global object. Reading them through a typed
 * reference keeps the access checked — a bare `globalThis.__X__` is `any`,
 * and assigning onto the global object directly is what
 * `unicorn/no-global-object-property-assignment` forbids.
 */
const viewLogHost = globalThis as unknown as Window;

export interface TrackViewParams {
  productId: string;
}

export function trackView(
  node: HTMLElement,
  params: TrackViewParams,
): { update: (next: TrackViewParams) => void; destroy: () => void } {
  let currentProductId = params.productId;

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      viewLogHost.__VIEW_LOG__ ??= [];
      viewLogHost.__VIEW_LOG__.push({
        productId: currentProductId,
        ts: Date.now(),
      });
    }
  });

  observer.observe(node);

  return {
    update(next: TrackViewParams): void {
      currentProductId = next.productId;
      viewLogHost.__VIEW_UPDATE_LOG__ ??= [];
      viewLogHost.__VIEW_UPDATE_LOG__.push({
        productId: next.productId,
        ts: Date.now(),
      });
    },
    destroy(): void {
      observer.disconnect();
    },
  };
}
