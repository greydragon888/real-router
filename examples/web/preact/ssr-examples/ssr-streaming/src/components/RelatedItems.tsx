import type { JSX } from "preact";

interface RelatedItem {
  id: string;
  name: string;
}

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

interface RelatedItemsProps {
  readonly productId: string;
}

export function RelatedItems({ productId }: RelatedItemsProps): JSX.Element {
  const items = RELATED_BY_PRODUCT[productId] ?? [];

  if (items.length === 0) {
    return <p data-testid="related-empty">No related items.</p>;
  }

  return (
    <section data-testid="related-section">
      <h2>Related items</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </section>
  );
}
