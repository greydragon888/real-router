import { use, useMemo } from "react";

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
  // Demonstrates Suspense-boundary error containment for product id "4":
  // the server resolves an empty reviews list (no error during SSR), but
  // the client's hydration `use(rejectedPromise)` throws synchronously,
  // and the wrapping <ReviewsErrorBoundary> catches it and replaces the
  // SSR-rendered Reviews section with the error UI. Critical product data
  // + sibling deferred (related items) render unaffected.
  if (productId === "4") {
    if (typeof globalThis.window === "undefined") {
      return Promise.resolve([]);
    }

    return Promise.reject(new Error("Reviews service unavailable"));
  }

  const reviews = REVIEWS_BY_PRODUCT[productId] ?? [];

  if (typeof globalThis.window === "undefined") {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(reviews);
      }, SERVER_REVIEWS_DELAY_MS);
    });
  }

  return Promise.resolve(reviews);
}

interface ReviewsProps {
  readonly productId: string;
}

export function Reviews({ productId }: ReviewsProps): React.ReactElement {
  const reviewsPromise = useMemo(() => fetchReviews(productId), [productId]);
  const reviews = use(reviewsPromise);

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
