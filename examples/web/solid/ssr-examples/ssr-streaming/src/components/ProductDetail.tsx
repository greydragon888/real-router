import { useRoute } from "@real-router/solid";
import { ErrorBoundary, Show, Suspense } from "solid-js";

import { ProductActions } from "./ProductActions";
import { RelatedItems } from "./RelatedItems";
import { Reviews } from "./Reviews";
import { trackView } from "../actions/track-view";

import type { ProductDetailData } from "../router/loaders";
import type { JSX } from "solid-js";

// `trackView` is imported but appears "unused" to TypeScript — that's a
// requirement of Solid's babel-preset directive transform. See the
// docstring in src/actions/track-view.ts for the full rationale.

const _ensureTrackViewBinding = trackView;

// NOTE — `<SuspenseList revealOrder>` is intentionally NOT used here.
// vite-plugin-solid 2.11.x emits divergent hydration-key counters when
// SuspenseList is wrapped around streaming Suspense boundaries: the
// browser logs "Hydration Mismatch. Unable to find DOM nodes for
// hydration key" on first paint and event handlers on subsequent
// elements (e.g. ProductActions) silently fail to attach. The
// SuspenseList API itself works at the Solid runtime level (the wire
// format ships ordered chunks correctly), but the integration with the
// current vite plugin is brittle. Track upstream + revisit once the
// plugin's hydration-key generator stabilises. Same root cause as the
// `RouteView.NotFound` workaround in App.tsx (top-level <Show> guard).
export function ProductDetail(): JSX.Element {
  const routeState = useRoute();
  const data = (): ProductDetailData | undefined =>
    routeState().route.context.data as ProductDetailData | undefined;

  return (
    <Show
      when={data()}
      fallback={<p data-testid="product-not-found">Product not found.</p>}
      keyed
    >
      {(d) => (
        <article
          data-testid="product-detail"
          data-product-id={d.product.id}
          use:trackView={{ productId: d.product.id }}
        >
          <h1 data-testid="product-name">{d.product.name}</h1>
          <p data-testid="product-price">${d.product.price}</p>
          <p data-testid="product-description">{d.product.description}</p>

          <ErrorBoundary
            fallback={(err: Error) => (
              <p data-testid="reviews-error">
                Reviews unavailable: {err.message}
              </p>
            )}
          >
            <Suspense
              fallback={<p data-testid="reviews-fallback">Loading reviews…</p>}
            >
              <Reviews productId={d.product.id} />
            </Suspense>
          </ErrorBoundary>

          <Suspense
            fallback={
              <p data-testid="related-fallback">Loading related items…</p>
            }
          >
            <RelatedItems productId={d.product.id} />
          </Suspense>

          <ProductActions />
        </article>
      )}
    </Show>
  );
}
