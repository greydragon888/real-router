import { Await } from "@real-router/preact/ssr";

import { REVIEWS_KEY, type ReviewsDeferred } from "../router/loaders";

import type { Review } from "../database";
import type { JSX } from "preact";

function ReviewList({ reviews }: { reviews: Review[] }): JSX.Element {
  if (reviews.length === 0) {
    return <p data-testid="reviews-empty">No reviews yet.</p>;
  }

  return (
    <section data-testid="reviews-section">
      <h2>Reviews ({reviews.length})</h2>
      <ul>
        {reviews.map((review) => (
          <li key={review.id} data-review-id={review.id}>
            <strong>{review.author}</strong> — {review.rating}/5
            <p>{review.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Reads the deferred reviews promise via `useDeferred`-backed `<Await>`.
 * Wrap in `<Streamed>` (preact/compat `<Suspense>` alias) for the fallback
 * boundary. Preact 10 throws the thenable for the surrounding Suspense to
 * catch — see `@real-router/preact/ssr` `<Await>` implementation.
 */
export function Reviews(): JSX.Element {
  return (
    <Await<Awaited<ReviewsDeferred>> name={REVIEWS_KEY}>
      {(reviews) => <ReviewList reviews={reviews} />}
    </Await>
  );
}
