<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";

// Vue's `onErrorCaptured` is the equivalent of React's ErrorBoundary class.
// Returning `false` from the hook stops error propagation. Scope is narrow:
// wraps just the deferred Reviews <Suspense> so failures don't crash the
// surrounding ProductDetail tree.
const error = ref<Error | null>(null);

onErrorCaptured((capturedError) => {
  error.value =
    capturedError instanceof Error ? capturedError : new Error(String(capturedError));
  console.warn("[Reviews] section failed:", error.value.message);
  return false;
});
</script>

<template>
  <p v-if="error" data-testid="reviews-error">
    Reviews unavailable: {{ error.message }}
  </p>
  <slot v-else />
</template>
