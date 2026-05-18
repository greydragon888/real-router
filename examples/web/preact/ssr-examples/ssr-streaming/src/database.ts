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
    { id: "r-1", name: "Wrist rest" },
    { id: "r-2", name: "Keycap puller" },
  ],
  "2": [{ id: "r-3", name: "Mouse pad" }],
  "3": [
    { id: "r-4", name: "USB-C cable" },
    { id: "r-5", name: "Monitor arm" },
  ],
};

const SERVER_REVIEWS_DELAY_MS = 600;
const SERVER_RELATED_DELAY_MS = 1200;
const isServer = typeof globalThis.window === "undefined";

/**
 * Server-side delay simulates a slow data source so the streaming pipeline
 * has something to defer. Client-side returns immediately so post-hydration
 * navigation feels instant.
 */
export function fetchReviews(productId: string): Promise<Review[]> {
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
