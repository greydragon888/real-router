import { Await } from "@real-router/preact/ssr";

import { RELATED_KEY, type RelatedDeferred } from "../router/loaders";

import type { RelatedItem } from "../database";
import type { JSX } from "preact";

function RelatedList({ items }: { items: RelatedItem[] }): JSX.Element {
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

export function RelatedItems(): JSX.Element {
  return (
    <Await<Awaited<RelatedDeferred>> name={RELATED_KEY}>
      {(items) => <RelatedList items={items} />}
    </Await>
  );
}
