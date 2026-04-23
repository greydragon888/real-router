<script setup lang="ts">
import { useNavigator, useRoute } from "@real-router/vue";
import { computed, onMounted, onUnmounted, shallowRef } from "vue";
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

const { route } = useRoute();
const navigator = useNavigator();

const lang = computed(
  () => (route.value?.params.lang as string | undefined) ?? "en",
);
</script>

<template>
  <div>
    <h1>Dashboard</h1>
    <div v-if="user" class="card">
      <p><strong>Logged in as:</strong> {{ user.name }}</p>
      <p><strong>Role:</strong> {{ user.role }}</p>
      <p><strong>Lang param:</strong> {{ lang }}</p>
    </div>
    <div
      :style="{
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
        flexWrap: 'wrap',
      }"
    >
      <button
        @click="
          navigator.navigate(
            route?.name ?? 'dashboard',
            { ...route?.params, lang: lang === 'en' ? 'ru' : 'en' },
            { reload: true },
          )
        "
      >
        Toggle lang ({{ lang === "en" ? "→ RU" : "→ EN" }})
      </button>
      <button class="danger" @click="emit('logout')">Logout</button>
    </div>
    <p :style="{ marginTop: '16px', fontSize: '14px', color: '#888' }">
      This page loads lazily — chunk loaded on first visit.
    </p>
  </div>
</template>
