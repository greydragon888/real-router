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

declare global {
  interface Window {
    __VIEW_LOG__?: { productId: string; ts: number }[];
  }
}

export interface TrackViewParams {
  productId: string;
}

export function trackView(
  node: HTMLElement,
  params: TrackViewParams,
): { update: (next: TrackViewParams) => void; destroy: () => void } {
  let currentProductId = params.productId;

  const observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) {
      window.__VIEW_LOG__ = window.__VIEW_LOG__ ?? [];
      window.__VIEW_LOG__.push({
        productId: currentProductId,
        ts: Date.now(),
      });
    }
  });

  observer.observe(node);

  return {
    update(next: TrackViewParams): void {
      currentProductId = next.productId;
    },
    destroy(): void {
      observer.disconnect();
    },
  };
}
