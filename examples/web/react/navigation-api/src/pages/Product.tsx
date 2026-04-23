import { Link, useNavigator, useRoute } from "@real-router/react";

import { ReturnToLastButton } from "../components/ReturnToLastButton";

import type { JSX } from "react";

const PRODUCT_IDS = [1, 2, 3, 5];

export function Product(): JSX.Element {
  const { route } = useRoute<{ id: string }>();
  const navigator = useNavigator();
  const id = Number(route?.params.id ?? "1");
  const currentIndex = PRODUCT_IDS.indexOf(id);
  const prevId =
    currentIndex > 0 ? PRODUCT_IDS[currentIndex - 1] : undefined;
  const nextId =
    currentIndex >= 0 && currentIndex < PRODUCT_IDS.length - 1
      ? PRODUCT_IDS[currentIndex + 1]
      : undefined;

  return (
    <section>
      <ReturnToLastButton />
      <h1>Product #{id}</h1>
      <p>Product detail page. Navigate by ID using the paginator below.</p>

      <div style={{ display: "flex", gap: "8px", margin: "16px 0" }}>
        <button
          type="button"
          disabled={prevId === undefined}
          onClick={() => {
            if (prevId !== undefined) {
              void navigator.navigate("products.product", {
                id: String(prevId),
              });
            }
          }}
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={nextId === undefined}
          onClick={() => {
            if (nextId !== undefined) {
              void navigator.navigate("products.product", {
                id: String(nextId),
              });
            }
          }}
        >
          Next →
        </button>
      </div>

      <p>
        <Link routeName="products.product.edit" routeParams={{ id: String(id) }}>
          Edit
        </Link>
      </p>
    </section>
  );
}
