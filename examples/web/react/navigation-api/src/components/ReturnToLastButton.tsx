import { useRoute, useRouter } from "@real-router/react";

import type { JSX } from "react";

export function ReturnToLastButton(): JSX.Element | null {
  const router = useRouter();
  // Subscribe so canGoBackTo refreshes on navigation.
  useRoute();

  if (!router.canGoBackTo("products")) {
    return null;
  }

  return (
    <div className="return-banner" role="region" aria-label="Return to list">
      <button
        type="button"
        onClick={() => {
          void router.traverseToLast("products");
        }}
      >
        ← Return to Products list
      </button>
    </div>
  );
}
