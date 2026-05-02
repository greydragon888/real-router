"use client";

import { errorCodes, RouterError } from "@real-router/core";
import { useRouter } from "@real-router/react";
import { useState } from "react";

export function RevalidateButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const state = router.getState();
    if (!state) return;

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
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "Revalidating..." : "Revalidate"}
    </button>
  );
}
