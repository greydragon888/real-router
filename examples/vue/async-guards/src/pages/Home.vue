<script setup lang="ts">
import { RouterError } from "@real-router/core";
import { useNavigator } from "@real-router/vue";
import { ref } from "vue";

import { cartState } from "../cart-state";

const navigator = useNavigator();
const cartHasItems = ref(true);
const toast = ref<{ msg: string; type: string } | null>(null);

function showToast(msg: string, type = "error") {
  toast.value = { msg, type };
  setTimeout(() => {
    toast.value = null;
  }, 3000);
}

async function goToCheckout() {
  cartState.hasItems = cartHasItems.value;
  try {
    await navigator.navigate("checkout");
  } catch (error) {
    if (error instanceof RouterError) {
      showToast(`${error.code}: cart is empty`);
    }
  }
}

function demoCancellation() {
  cartState.hasItems = true;
  navigator.navigate("checkout").catch(() => {});
  setTimeout(() => {
    navigator.navigate("about").catch(() => {});
  }, 150);
}

function toggleCart() {
  const next = !cartHasItems.value;

  cartHasItems.value = next;
  cartState.hasItems = next;
}
</script>

<template>
  <div>
    <h1>Home</h1>
    <p>
      This example demonstrates async guards, progress bar, and AbortController
      cancellation.
    </p>

    <div class="card">
      <div class="toggle">
        <input
          id="cart-toggle"
          type="checkbox"
          :checked="cartHasItems"
          @change="toggleCart()"
        />
        <label for="cart-toggle">
          Cart has items: <strong>{{ cartHasItems ? "Yes" : "No" }}</strong>
        </label>
      </div>

      <div :style="{ display: 'flex', gap: '8px', marginTop: '8px' }">
        <button @click="goToCheckout()">Go to Checkout (500ms guard)</button>
        <button @click="demoCancellation()">
          Checkout → About (cancellation)
        </button>
      </div>
      <p :style="{ fontSize: '13px', color: '#888', marginTop: '8px' }">
        Watch the progress bar during the 500ms guard. Empty cart →
        CANNOT_ACTIVATE toast. Cancellation: second navigation aborts the first
        → TRANSITION_CANCELLED.
      </p>
    </div>

    <div v-if="toast" :class="['toast', toast.type]">{{ toast.msg }}</div>
  </div>
</template>
