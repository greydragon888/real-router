<script setup lang="ts">
import { RouterError } from "@real-router/core";
import { Link, RouterErrorBoundary, useNavigator } from "@real-router/vue";
import { h, ref } from "vue";

const navigator = useNavigator();
const toast = ref<{ msg: string; type: string } | null>(null);

function showToast(msg: string, type = "error") {
  toast.value = { msg, type };
  setTimeout(() => {
    toast.value = null;
  }, 3500);
}

async function goToUnknown() {
  try {
    await navigator.navigate("@@nonexistent-route");
  } catch (error) {
    if (error instanceof RouterError) {
      showToast(error.code);
    }
  }
}

async function goToProtected() {
  try {
    await navigator.navigate("protected");
  } catch (error) {
    if (error instanceof RouterError) {
      showToast(`${error.code}: access denied`);
    }
  }
}

async function goToSlowThenCancel() {
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
}

function fireAndForget() {
  navigator.navigate("protected").catch(() => {});
  showToast("Fire-and-forget sent (error suppressed internally)", "success");
}

function errorFallback(error: RouterError, resetError: () => void) {
  return h("div", { class: "toast error", style: { position: "relative" } }, [
    error.code,
    " ",
    h("button", { onClick: resetError, style: { marginLeft: "8px" } }, "✕"),
  ]);
}
</script>

<template>
  <div>
    <h1>Home</h1>
    <p>
      Each button below triggers a specific navigation error. Errors are caught
      with <code>try/catch</code> and also captured by the
      <code>onTransitionError</code> plugin panel below.
    </p>

    <div
      class="card"
      :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }"
    >
      <button @click="goToUnknown()">Go to Unknown → ROUTE_NOT_FOUND</button>
      <button @click="goToProtected()">
        Go to Protected → CANNOT_ACTIVATE
      </button>
      <button @click="goToSlowThenCancel()">
        Go to Slow then cancel → TRANSITION_CANCELLED
      </button>
      <button @click="fireAndForget()">
        Fire-and-forget (no await, error suppressed)
      </button>
    </div>

    <div class="card" :style="{ marginTop: '16px' }">
      <h3>Declarative approach — RouterErrorBoundary</h3>
      <p :style="{ fontSize: '13px', color: '#888' }">
        No try/catch needed. Errors are shown as a toast alongside the links.
      </p>
      <RouterErrorBoundary :fallback="errorFallback">
        <div :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }">
          <Link routeName="@@nonexistent-route">
            Go to Unknown → ROUTE_NOT_FOUND
          </Link>
          <Link routeName="protected">Go to Protected → CANNOT_ACTIVATE</Link>
        </div>
      </RouterErrorBoundary>
    </div>

    <div v-if="toast" :class="['toast', toast.type]">{{ toast.msg }}</div>
  </div>
</template>
