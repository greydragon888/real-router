import { useRoute, useRouter } from "@real-router/react";

import type { State } from "@real-router/core";
import type { JSX } from "react";

function labelFor(state: State): string {
  switch (state.name) {
    case "home":
      return "Home";
    case "products":
      return "Products";
    case "products.product":
      return `Product #${String(state.params.id)}`;
    case "products.product.edit":
      return `Edit #${String(state.params.id)}`;
    case "categories":
      return "Categories";
    case "cart":
      return "Cart";
    case "checkout":
      return "Checkout";
    case "about":
      return "About";
    default:
      return state.name;
  }
}

export function SmartNavButtons(): JSX.Element {
  const router = useRouter();
  // Subscribe to route changes so peek values refresh on navigation.
  useRoute();

  const prev = router.peekBack();
  const next = router.peekForward();
  const canBack = router.canGoBack();
  const canForward = router.canGoForward();

  return (
    <div className="smart-nav">
      <button
        type="button"
        disabled={!canBack}
        title={prev ? `Go back to ${prev.path}` : "No previous entry"}
        onClick={() => {
          globalThis.history.back();
        }}
      >
        ← {prev ? labelFor(prev) : "(nothing)"}
      </button>
      <button
        type="button"
        disabled={!canForward}
        title={next ? `Go forward to ${next.path}` : "No forward entry"}
        onClick={() => {
          globalThis.history.forward();
        }}
      >
        {next ? labelFor(next) : "(nothing)"} →
      </button>
    </div>
  );
}
