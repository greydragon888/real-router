<script lang="ts">
  import { RouterError } from "@real-router/core";
  import { useNavigator } from "@real-router/svelte";

  import { cartState } from "../cart-state";

  const navigator = useNavigator();
  let cartHasItems = $state(true);
  let toast = $state<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = "error") => {
    toast = { msg, type };
    setTimeout(() => {
      toast = null;
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
    cartHasItems = next;
    cartState.hasItems = next;
  };
</script>

<div>
  <h1>Home</h1>
  <p>
    This example demonstrates async guards, progress bar, and
    AbortController cancellation.
  </p>

  <div class="card">
    <div class="toggle">
      <input
        id="cart-toggle"
        type="checkbox"
        checked={cartHasItems}
        onchange={toggleCart}
      />
      <label for="cart-toggle">
        Cart has items: <strong>{cartHasItems ? "Yes" : "No"}</strong>
      </label>
    </div>

    <div style="display: flex; gap: 8px; margin-top: 8px">
      <button
        onclick={() => {
          void goToCheckout();
        }}
      >
        Go to Checkout (500ms guard)
      </button>
      <button onclick={demoCancellation}>
        Checkout → About (cancellation)
      </button>
    </div>
    <p style="font-size: 13px; color: #888; margin-top: 8px">
      Watch the progress bar during the 500ms guard. Empty cart →
      CANNOT_ACTIVATE toast. Cancellation: second navigation aborts the
      first → TRANSITION_CANCELLED.
    </p>
  </div>

  {#if toast}
    <div class="toast {toast.type}">{toast.msg}</div>
  {/if}
</div>
