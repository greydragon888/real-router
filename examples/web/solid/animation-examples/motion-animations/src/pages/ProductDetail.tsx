import { Link, useRoute } from "@real-router/solid";
import { Show, createMemo } from "solid-js";

import type { JSX } from "solid-js";

const COVERS: Partial<Record<string, { name: string; color: string }>> = {
  1: { name: "Crimson Flask", color: "#b91c1c" },
  2: { name: "Azure Orb", color: "#1d4ed8" },
  3: { name: "Emerald Prism", color: "#047857" },
  4: { name: "Amber Cube", color: "#b45309" },
  5: { name: "Violet Sphere", color: "#6d28d9" },
  6: { name: "Slate Block", color: "#334155" },
};

export function ProductDetail(): JSX.Element {
  const routeState = useRoute<{ id: string }>();
  const id = createMemo(() => routeState().route.params.id);
  const product = createMemo(() => COVERS[id()]);

  return (
    <Show
      when={product()}
      fallback={
        <div>
          <h2>Unknown product</h2>
          <Link routeName="products" activeStrict>
            Back to products
          </Link>
        </div>
      }
    >
      {(productAccessor) => (
        <div>
          <h2>{productAccessor().name}</h2>
          <div
            class="product-cover"
            style={{ "background-color": productAccessor().color }}
            aria-hidden="true"
          />
          <p>
            Note: no library-driven hero morph here. Motion One does not ship{" "}
            <code>layoutId</code>, so the thumbnail's coloured square cannot be
            paired with this cover via a single prop. For an inverse-FLIP hero
            morph in Solid, see <code>route-animations/</code> →{" "}
            <code>useHeroMorph</code>: capture rect on <code>useRouteExit</code>
            , animate via WAAPI on <code>navigator.subscribe</code>.
          </p>
          <p>
            <Link routeName="products" activeStrict>
              ← Back to products
            </Link>
          </p>
        </div>
      )}
    </Show>
  );
}
