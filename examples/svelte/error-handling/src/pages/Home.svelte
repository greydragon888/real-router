<script lang="ts">
  import { RouterError } from "@real-router/core";
  import { Link, RouterErrorBoundary, useNavigator } from "@real-router/svelte";

  const navigator = useNavigator();
  let toast = $state<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = "error") => {
    toast = { msg, type };
    setTimeout(() => {
      toast = null;
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
</script>

<div>
  <h1>Home</h1>
  <p>
    Each button below triggers a specific navigation error. Errors are
    caught with <code>try/catch</code> and also captured by the
    <code>onTransitionError</code> plugin panel below.
  </p>

  <div
    class="card"
    style="display: flex; flex-direction: column; gap: 8px"
  >
    <button
      onclick={() => {
        void goToUnknown();
      }}
    >
      Go to Unknown → ROUTE_NOT_FOUND
    </button>
    <button
      onclick={() => {
        void goToProtected();
      }}
    >
      Go to Protected → CANNOT_ACTIVATE
    </button>
    <button
      onclick={() => {
        void goToSlowThenCancel();
      }}
    >
      Go to Slow then cancel → TRANSITION_CANCELLED
    </button>
    <button onclick={fireAndForget}>
      Fire-and-forget (no await, error suppressed)
    </button>
  </div>

  <div class="card" style="margin-top: 16px">
    <h3>Declarative approach — RouterErrorBoundary</h3>
    <p style="font-size: 13px; color: #888">
      No try/catch needed. Errors are shown as a toast alongside the links.
    </p>
    <RouterErrorBoundary>
      {#snippet fallback(error, resetError)}
        <div class="toast error" style="position: relative">
          {error.code}
          <button onclick={resetError} style="margin-left: 8px">✕</button>
        </div>
      {/snippet}
      <div style="display: flex; flex-direction: column; gap: 8px">
        <Link routeName="@@nonexistent-route">
          Go to Unknown → ROUTE_NOT_FOUND
        </Link>
        <Link routeName="protected">Go to Protected → CANNOT_ACTIVATE</Link>
      </div>
    </RouterErrorBoundary>
  </div>

  {#if toast}
    <div class="toast {toast.type}">{toast.msg}</div>
  {/if}
</div>
