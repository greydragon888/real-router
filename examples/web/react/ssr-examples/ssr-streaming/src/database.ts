export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
}

export interface RelatedItem {
  id: string;
  name: string;
  price: number;
}

const products = new Map<string, Product>([
  [
    "1",
    {
      id: "1",
      name: "Mechanical Keyboard",
      description: "Premium tactile switches, RGB, hot-swappable.",
      price: 159.99,
    },
  ],
  [
    "2",
    {
      id: "2",
      name: "Ergonomic Mouse",
      description: "Vertical grip, 6 programmable buttons, wireless.",
      price: 89.5,
    },
  ],
  [
    "3",
    {
      id: "3",
      name: "4K Monitor",
      description: '27" IPS panel, 144Hz, USB-C.',
      price: 549,
    },
  ],
  // Test fixture for Suspense error boundary scenario (id 4):
  // Reviews loader rejects on this productId, but critical product data
  // resolves normally — error containment verified end-to-end.
  [
    "4",
    {
      id: "4",
      name: "Broken Reviews Demo",
      description: "Reviews fetch is intentionally rejected for this product.",
      price: 0,
    },
  ],
]);

export function getProduct(id: string): Product | undefined {
  return products.get(id);
}

export function listProducts(): Product[] {
  return [...products.values()];
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

const RELATED_BY_PRODUCT: Record<string, RelatedItem[]> = {
  "1": [
    { id: "k1", name: "Wrist Rest", price: 24.99 },
    { id: "k2", name: "Keycap Puller", price: 6.5 },
  ],
  "2": [
    { id: "m1", name: "Mouse Pad", price: 14.99 },
    { id: "m2", name: "USB-C Hub", price: 39.99 },
  ],
  "3": [
    { id: "d1", name: "Monitor Arm", price: 79 },
    { id: "d2", name: "USB-C Cable", price: 12.99 },
  ],
};

const SERVER_REVIEWS_DELAY_MS = 600;
const SERVER_RELATED_DELAY_MS = 1200;
const isServer = typeof globalThis.window === "undefined";

/**
 * Fetch reviews for a product. Server-side artificially delays so the
 * streaming pipeline shows fallback first, then resolves the Suspense
 * boundary as the deferred promise lands. Product id "4" rejects to verify
 * Suspense error containment — with `defer()`, the server runs the loader
 * and ships the rejection via `<script>__rrDeferError__("reviews", ...)
 * </script>`, which lands as a rejected promise on the client. React 19's
 * `use(rejectedPromise)` throws into `<ReviewsErrorBoundary>`. Critical
 * product data + sibling deferred (related items) render unaffected.
 */
export function fetchReviews(productId: string): Promise<Review[]> {
  if (productId === "4") {
    return Promise.reject(new Error("Reviews service unavailable"));
  }

  const reviews = REVIEWS_BY_PRODUCT[productId] ?? [];

  if (isServer) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(reviews);
      }, SERVER_REVIEWS_DELAY_MS);
    });
  }

  return Promise.resolve(reviews);
}

export function fetchRelated(productId: string): Promise<RelatedItem[]> {
  const items = RELATED_BY_PRODUCT[productId] ?? [];

  if (isServer) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(items);
      }, SERVER_RELATED_DELAY_MS);
    });
  }

  return Promise.resolve(items);
}
