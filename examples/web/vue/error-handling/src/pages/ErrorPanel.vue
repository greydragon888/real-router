<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue";

import { errorStore } from "../error-store";

import type { ErrorEntry } from "../error-store";

const errors = shallowRef<readonly ErrorEntry[]>(errorStore.getAll());

let unsub: (() => void) | undefined;

onMounted(() => {
  unsub = errorStore.subscribe(() => {
    errors.value = errorStore.getAll();
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <div class="card" :style="{ marginTop: '24px' }">
    <strong>onTransitionError plugin log</strong>
    <p
      v-if="errors.length === 0"
      :style="{ color: '#888', marginTop: '8px', fontSize: '13px' }"
    >
      No errors yet — click the buttons above to trigger navigation errors.
    </p>
    <ul v-else :style="{ paddingLeft: '16px', marginTop: '8px' }">
      <li
        v-for="(entry, i) in [...errors].reverse()"
        :key="i"
        :style="{ marginBottom: '4px', fontSize: '13px' }"
      >
        <strong :style="{ color: '#c62828' }">{{ entry.code }}</strong>
        {{ entry.path ? ` — path: ${entry.path}` : "" }}
        <span :style="{ color: '#888', marginLeft: '8px' }">
          {{ new Date(entry.time).toLocaleTimeString() }}
        </span>
      </li>
    </ul>
  </div>
</template>
