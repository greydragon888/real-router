import type { JSX } from "preact";

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

interface ReviewsProps {
  readonly productId: string;
}

// Synchronous component reading pre-resolved data. In React 19's
// equivalent example, this section uses `use(promiseOf<Reviews>)`
// inside a Suspense boundary to defer until the promise settles —
// React's renderToReadableStream then streams the fallback first
// and the resolved chunk later.
//
// Preact 10 has no `use(promise)`. Async function components +
// <Suspense> don't yet integrate with renderToReadableStream the
// same way (the renderer skips async returns silently). True
// in-component data deferral lands in Preact v11.
//
// For Preact 10, deferred data lives in `state.context.data`
// (populated by ssr-data-plugin's start interceptor BEFORE the
// streaming render begins). "Streaming" here is HTTP-level —
// `Transfer-Encoding: chunked` ships shell bytes as they're
// produced — but every Suspense-style data section is pre-resolved.
export function Reviews({ productId }: ReviewsProps): JSX.Element {
  const reviews = REVIEWS_BY_PRODUCT[productId] ?? [];

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
