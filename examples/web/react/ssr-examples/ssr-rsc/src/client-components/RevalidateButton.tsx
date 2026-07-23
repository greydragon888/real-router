"use client";

import { errorCodes, RouterError } from "@real-router/core";
import { useRouter } from "@real-router/react";
import { invalidate } from "@real-router/rsc-server-plugin";
import { useState } from "react";

import type { ReactElement } from "react";

export function RevalidateButton(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function revalidate(): Promise<void> {
    const state = router.getState();

    if (!state) {
      return;
    }

    setPending(true);
    try {
      // `invalidate(router, "rsc")` marks the namespace stale on this router.
      // In this RSC architecture the rsc-server-plugin lives on the SERVER's
      // per-request cloneRouter, so the client-side flag is documentation
      // for the surgical-refresh contract — the actual Flight refresh is
      // driven by the App.tsx subscribe → /__rsc fetch handler, and each
      // /__rsc request creates a fresh server router that always runs the
      // loader. Reload bypasses stabilizeState dedupe (#605) so subscribers
      // re-render with the new payload.
      invalidate(router, "rsc");
      await router.navigate(state.name, state.params, state.search, {
        reload: true,
      });
    } catch (error) {
      if (
        error instanceof RouterError &&
        error.code === errorCodes.TRANSITION_CANCELLED
      ) {
        return;
      }

      console.error("[RevalidateButton] navigate failed:", error);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="revalidate"
      onClick={() => {
        void revalidate();
      }}
      disabled={pending}
    >
      {pending ? "Revalidating..." : "Revalidate"}
    </button>
  );
}
