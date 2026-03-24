import { RouterError } from "@real-router/core";
import { useNavigator } from "@real-router/react";
import { useState } from "react";

import { cartState } from "../cart-state";

import type { JSX } from "react";

export function Home(): JSX.Element {
  const navigator = useNavigator();
  const [cartHasItems, setCartHasItems] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(
    null,
  );

  const showToast = (msg: string, type = "error") => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const goToCheckout = async () => {
    cartState.hasItems = cartHasItems;
    try {
      await navigator.navigate("checkout");
    } catch (error) {
      if (error instanceof RouterError) {
        showToast(`${error.code}: cart is empty`);
      }
    }
  };

  const demoCancellation = () => {
    cartState.hasItems = true;
    navigator.navigate("checkout").catch(() => {});
    setTimeout(() => {
      navigator.navigate("about").catch(() => {});
    }, 150);
  };

  const toggleCart = () => {
    const next = !cartHasItems;

    setCartHasItems(next);
    cartState.hasItems = next;
  };

  return (
    <div>
      <h1>Home</h1>
      <p>
        This example demonstrates async guards, progress bar, and
        AbortController cancellation.
      </p>

      <div className="card">
        <div className="toggle">
          <input
            id="cart-toggle"
            type="checkbox"
            checked={cartHasItems}
            onChange={toggleCart}
          />
          <label htmlFor="cart-toggle">
            Cart has items: <strong>{cartHasItems ? "Yes" : "No"}</strong>
          </label>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            onClick={() => {
              void goToCheckout();
            }}
          >
            Go to Checkout (500ms guard)
          </button>
          <button onClick={demoCancellation}>
            Checkout → About (cancellation)
          </button>
        </div>
        <p style={{ fontSize: "13px", color: "#888", marginTop: "8px" }}>
          Watch the progress bar during the 500ms guard. Empty cart →
          CANNOT_ACTIVATE toast. Cancellation: second navigation aborts the
          first → TRANSITION_CANCELLED.
        </p>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
