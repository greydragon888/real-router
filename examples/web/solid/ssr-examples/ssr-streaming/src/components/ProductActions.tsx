import { createSignal, ErrorBoundary, onMount } from "solid-js";
import { isServer } from "solid-js/web";

import type { JSX } from "solid-js";

// Demonstrates two Solid SSR-relevant patterns:
//
//   1. <ErrorBoundary fallback={(err, reset) => ...}> — Solid's primitive
//      for catching errors thrown during render or in child resources.
//      The `reset` argument is what makes Solid's ErrorBoundary distinct
//      from React's: callers can re-attempt the failed branch without
//      remounting the whole tree.
//
//   2. onMount + isServer — Solid's safe pattern for client-only side
//      effects. `isServer` is a compile-time constant: dead-code
//      elimination removes the body on the server, so window-only APIs
//      stay out of the SSR bundle.
//
// The crash trigger toggles a signal that a child component reads inside
// its render path. When `crashed` is true, the child throws; the boundary
// catches it and renders the @failed fallback with `reset`. Clicking
// "Try again" calls `reset()` and `setCrashed(false)`, restoring the
// original tree.

declare global {
  interface Window {
    __MOUNT_LOG__?: { source: string; ts: number }[];
  }
}

function CrashOnDemand(props: { crashed: boolean }): JSX.Element {
  // Solid components run their function body once. To re-throw on every
  // reactive update, derive a reactive accessor that throws inline. The
  // ErrorBoundary catches the throw because it happens inside a tracked
  // expression. Plain `if (props.crashed) throw` would only run at mount.
  const message = (): string => {
    if (props.crashed) {
      throw new Error("Intentional reactive error");
    }

    return "All systems go";
  };

  return <p data-testid="actions-message">{message()}</p>;
}

export function ProductActions(): JSX.Element {
  const [crashed, setCrashed] = createSignal(false);

  // onMount is the SSR-safe place for side effects. It runs on the
  // client after hydration, never on the server. The isServer guard is
  // belt-and-suspenders — onMount alone would already be skipped on the
  // server, but the explicit branch makes the safety contract obvious.
  onMount(() => {
    if (!isServer) {
      window.__MOUNT_LOG__ = window.__MOUNT_LOG__ ?? [];
      window.__MOUNT_LOG__.push({
        source: "ProductActions",
        ts: Date.now(),
      });
    }
  });

  return (
    <ErrorBoundary
      fallback={(err: Error, reset) => (
        <section data-testid="product-actions-error">
          <h3>Actions unavailable</h3>
          <p data-testid="actions-error-message">{err.message}</p>
          <button
            type="button"
            data-testid="actions-error-reset"
            onClick={() => {
              setCrashed(false);
              reset();
            }}
          >
            Try again
          </button>
        </section>
      )}
    >
      <section data-testid="product-actions">
        <h3>Actions</h3>
        <CrashOnDemand crashed={crashed()} />
        <button
          type="button"
          data-testid="trigger-client-error"
          onClick={() => setCrashed(true)}
        >
          Trigger client error
        </button>
      </section>
    </ErrorBoundary>
  );
}
