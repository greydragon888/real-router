import { Await } from "@real-router/react/ssr";

import { REVIEWS_KEY, type ReviewsDeferred } from "../router/loaders";

import type { Review } from "../database";
import type { ReactElement } from "react";

function ReviewList({ reviews }: { reviews: Review[] }): ReactElement {
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
 * Reads the deferred reviews promise published by the loader via
 * `defer({ deferred: { reviews: fetchReviews(id) } })`. React 19's `use()`
 * suspends the boundary while the promise is pending; the surrounding
 * `<Suspense>` (or `<Streamed>`) renders its fallback. On error,
 * `<ReviewsErrorBoundary>` catches via the React class boundary contract.
 */
export function Reviews(): ReactElement {
  return (
    <Await<Awaited<ReviewsDeferred>> name={REVIEWS_KEY}>
      {(reviews) => <ReviewList reviews={reviews} />}
    </Await>
  );
}
