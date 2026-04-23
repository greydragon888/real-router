import { RouterError } from "@real-router/core";
import { Link, RouterErrorBoundary, useNavigator } from "@real-router/solid";
import { createSignal, Show } from "solid-js";

import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  const navigator = useNavigator();
  const [toast, setToast] = createSignal<{ msg: string; type: string } | null>(
    null,
  );

  const showToast = (msg: string, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const goToUnknown = async () => {
    try {
      await navigator.navigate("@@nonexistent-route");
    } catch (error) {
      if (error instanceof RouterError) {
        showToast(error.code);
      }
    }
  };

  const goToProtected = async () => {
    try {
      await navigator.navigate("protected");
    } catch (error) {
      if (error instanceof RouterError) {
        showToast(`${error.code}: access denied`);
      }
    }
  };

  const goToSlowThenCancel = async () => {
    try {
      const navPromise = navigator.navigate("slow");

      setTimeout(() => {
        void navigator.navigate("about");
      }, 300);
      await navPromise;
    } catch (error) {
      if (error instanceof RouterError) {
        showToast(`${error.code}: navigation was cancelled`);
      }
    }
  };

  const fireAndForget = () => {
    navigator.navigate("protected").catch(() => {});
    showToast("Fire-and-forget sent (error suppressed internally)", "success");
  };

  return (
    <div>
      <h1>Home</h1>
      <p>
        Each button below triggers a specific navigation error. Errors are
        caught with <code>try/catch</code> and also captured by the{" "}
        <code>onTransitionError</code> plugin panel below.
      </p>

      <div
        class="card"
        style={{ display: "flex", "flex-direction": "column", gap: "8px" }}
      >
        <button
          onClick={() => {
            void goToUnknown();
          }}
        >
          Go to Unknown → ROUTE_NOT_FOUND
        </button>
        <button
          onClick={() => {
            void goToProtected();
          }}
        >
          Go to Protected → CANNOT_ACTIVATE
        </button>
        <button
          onClick={() => {
            void goToSlowThenCancel();
          }}
        >
          Go to Slow then cancel → TRANSITION_CANCELLED
        </button>
        <button onClick={fireAndForget}>
          Fire-and-forget (no await, error suppressed)
        </button>
      </div>

      <div class="card" style={{ "margin-top": "16px" }}>
        <h3>Declarative approach — RouterErrorBoundary</h3>
        <p style={{ "font-size": "13px", color: "#888" }}>
          No try/catch needed. Click a link to trigger an error — the toast
          appears alongside the links.
        </p>
        <RouterErrorBoundary
          fallback={(error, resetError) => (
            <div class="toast error" style={{ position: "relative" }}>
              {error.code}{" "}
              <button onClick={resetError} style={{ "margin-left": "8px" }}>
                ✕
              </button>
            </div>
          )}
        >
          <div
            style={{ display: "flex", "flex-direction": "column", gap: "8px" }}
          >
            <Link routeName="@@nonexistent-route">
              Go to Unknown → ROUTE_NOT_FOUND
            </Link>
            <Link routeName="protected">Go to Protected → CANNOT_ACTIVATE</Link>
          </div>
        </RouterErrorBoundary>
      </div>

      <Show when={toast()}>
        {(t) => <div class={`toast ${t().type}`}>{t().msg}</div>}
      </Show>
    </div>
  );
}
