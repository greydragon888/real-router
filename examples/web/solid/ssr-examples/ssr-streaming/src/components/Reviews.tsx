import { createResource, For, Show } from "solid-js";

import type { JSX } from "solid-js";

interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
}

const REVIEWS_BY_PRODUCT: Record<string, Review[]> = {
  "1": [
    { id: "r1", author: "Alice", rating: 5, text: "Best keyboard I've owned." },
    { id: "r2", author: "Bob", rating: 4, text: "Great feel, slightly loud." },
  ],
  "2": [{ id: "r3", author: "Carol", rating: 5, text: "Wrist pain gone." }],
  "3": [
    { id: "r4", author: "Dave", rating: 5, text: "Colors are gorgeous." },
    { id: "r5", author: "Eve", rating: 4, text: "Stand wobbles a bit." },
  ],
};

const SERVER_REVIEWS_DELAY_MS = 600;

function fetchReviews(productId: string): Promise<Review[]> {
  // Suspense-boundary error containment for product id "4": both server and
  // client reject. Solid serializes the server-resolved resource value to
  // the client (unlike Vue's `<Suspense>` + `async setup()` which re-runs
  // the fetcher on hydration), so the rejection must originate on the
  // server side for the streamed HTML to ship the `<ErrorBoundary>`
  // fallback. The error is therefore observable in both no-JS HTML and the
  // hydrated DOM — symmetric with the streaming model.
  if (productId === "4") {
    return Promise.reject(new Error("Reviews service unavailable"));
  }

  const reviews = REVIEWS_BY_PRODUCT[productId] ?? [];

  if (typeof globalThis.window === "undefined") {
    return new Promise((resolve) =>
      setTimeout(() => resolve(reviews), SERVER_REVIEWS_DELAY_MS),
    );
  }

  return Promise.resolve(reviews);
}

export function Reviews(props: { productId: string }): JSX.Element {
  const [reviews] = createResource(() => props.productId, fetchReviews);

  return (
    <Show when={reviews()} keyed>
      {(list) => (
        <Show
          when={list.length > 0}
          fallback={<p data-testid="reviews-empty">No reviews yet.</p>}
        >
          <section data-testid="reviews-section">
            <h2>Reviews ({list.length})</h2>
            <ul>
              <For each={list}>
                {(review) => (
                  <li data-review-id={review.id}>
                    <strong>{review.author}</strong> — {review.rating}/5
                    <p>{review.text}</p>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      )}
    </Show>
  );
}
