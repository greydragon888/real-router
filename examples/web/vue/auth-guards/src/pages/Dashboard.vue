<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue";
import { store } from "../../../../shared/store";

import type { User } from "../../../../shared/api";

const emit = defineEmits<{
  logout: [];
}>();

const user = shallowRef<User | null>(store.get("user") as User | null);
let unsub: (() => void) | undefined;

onMounted(() => {
  unsub = store.subscribe(() => {
    user.value = store.get("user") as User | null;
  });
});

onUnmounted(() => {
  unsub?.();
});
</script>

<template>
  <div>
    <h1>Dashboard</h1>
    <div v-if="user" class="card">
      <p><strong>Logged in as:</strong> {{ user.name }}</p>
      <p><strong>Role:</strong> {{ user.role }}</p>
      <p><strong>Email:</strong> {{ user.email }}</p>
    </div>
    <p>
      The route tree was atomically replaced on login:
      <code>routesApi.clear() + routesApi.add(privateRoutes)</code>
    </p>
    <button
      class="danger"
      :style="{ marginTop: '16px' }"
      @click="emit('logout')"
    >
      Logout
    </button>
  </div>
</template>
