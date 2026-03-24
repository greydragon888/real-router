<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { store } from "../../../../shared/store";

const displayName = ref("");

watch(displayName, (val) => {
  store.set("settings:unsaved", val !== "");
});

onUnmounted(() => {
  store.set("settings:unsaved", false);
});
</script>

<template>
  <div>
    <h1>Settings</h1>
    <div class="card">
      <div class="form-group">
        <label>Display Name</label>
        <input v-model="displayName" placeholder="Enter your display name…" />
      </div>
      <p v-if="displayName" :style="{ color: '#c62828', fontSize: '14px' }">
        You have unsaved changes. Navigating away will trigger
        <code>canDeactivate</code> guard confirmation.
      </p>
      <button class="primary" :style="{ marginTop: '8px' }">Save</button>
    </div>
  </div>
</template>
