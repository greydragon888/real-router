"use client";

import { errorCodes, RouterError } from "@real-router/core";
import { useRouter } from "@real-router/react";
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
      await router.navigate(state.name, state.params, { reload: true });
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
