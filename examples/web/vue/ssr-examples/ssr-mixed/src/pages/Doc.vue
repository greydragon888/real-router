<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";
import { computed, onMounted, onUnmounted, ref } from "vue";

interface DocData {
  id: string;
  format: string;
  body: string;
}

const { route } = useRoute();
const mode = computed(() => getSsrDataMode(route.value));
const ssrData = computed(
  () => route.value.context.data as DocData | undefined,
);
const clientData = ref<DocData | null>(null);
let handle: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  if (mode.value !== "client-only" || ssrData.value !== undefined) return;

  handle = setTimeout(() => {
    clientData.value = {
      id: String(route.value.params.id),
      format: String(route.value.search.format),
      body: `(client) PDF placeholder for ${String(route.value.params.id)}`,
    };
  }, 50);
});

onUnmounted(() => {
  if (handle !== undefined) clearTimeout(handle);
});

const data = computed(() => ssrData.value ?? clientData.value);
</script>

<template>
  <main data-testid="doc">
    <h1>Doc (mode: {{ mode }})</h1>
    <p v-if="!data" data-testid="doc-loading">Loading…</p>
    <div v-else>
      <p data-testid="doc-id">id: {{ data.id }}</p>
      <p data-testid="doc-format">format: {{ data.format }}</p>
      <p data-testid="doc-body">{{ data.body }}</p>
    </div>
  </main>
</template>
