<script setup lang="ts">
import { onMounted, ref } from "vue";

defineProps<{
  productId: string;
  productName: string;
}>();

// Visibility state — toggled by the trigger button. Initial state is
// closed; SSR ships zero dialog markup.
const open = ref(false);

// Canonical Vue 3 pattern for streaming-safe <Teleport>: gate the
// portal behind `:disabled="!mounted"` so the teleport activates
// AFTER hydration completes, not during. Otherwise Vue's SSR walker
// emits placeholder markers the client may not match exactly,
// triggering "Hydration completed but contains mismatches."
//
// Server: mounted = false → <Teleport disabled> → modal renders
// inline at the declared site (which, gated by v-if, emits nothing).
// Client mount: onMounted fires, mounted flips to true, the teleport
// activates and any open content moves to #modal-target.
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

function toggle(): void {
  open.value = !open.value;
}
</script>

<template>
  <button
    type="button"
    data-testid="open-specs-modal"
    @click="toggle"
  >
    {{ open ? "Close" : "Open" }} specs
  </button>

  <Teleport to="#modal-target" :disabled="!mounted">
    <div
      v-if="open"
      role="dialog"
      data-testid="specs-modal"
      :data-product-id="productId"
    >
      <h3>{{ productName }} — full specs</h3>
      <p>Detailed specs for product id {{ productId }}.</p>
      <button
        type="button"
        data-testid="close-specs-modal"
        @click="open = false"
      >
        Close
      </button>
    </div>
  </Teleport>
</template>
