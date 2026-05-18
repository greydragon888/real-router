import { Await } from "@real-router/react/ssr";

import { RELATED_KEY, type RelatedDeferred } from "../router/loaders";

import type { RelatedItem } from "../database";
import type { ReactElement } from "react";

function RelatedList({ items }: { items: RelatedItem[] }): ReactElement {
  return (
    <section data-testid="related-section">
      <h2>You might also like</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} data-related-id={item.id}>
            {item.name} — ${item.price}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Reads the deferred related-items promise published by the loader. Same
 * `<Suspense>` integration as `<Reviews>` but separate boundary — selective
 * hydration: each Suspense child resolves independently in HTML byte order.
 */
export function RelatedItems(): ReactElement {
  return (
    <Await<Awaited<RelatedDeferred>> name={RELATED_KEY}>
      {(items) => <RelatedList items={items} />}
    </Await>
  );
}
