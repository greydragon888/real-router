<script setup lang="ts">
import { useRoute, useRouter } from "@real-router/vue";
import { invalidate } from "@real-router/ssr-data-plugin";
import { computed } from "vue";

interface HomeData {
  greeting: string;
  fetchedAt: number;
  aborts: number;
}

const { route } = useRoute();
const router = useRouter();
const data = computed(() => route.value.context.data as HomeData | undefined);

// Escape hatch: mark "data" stale, then trigger a same-route reload.
// Reload bypasses stabilizeState dedupe (#605), so useRoute() re-renders
// with the fresh snapshot written by the plugin's subscribeLeave handler.
function handleRefresh(): void {
  invalidate(router, "data");
  void router.navigate(
    route.value.name,
    route.value.params,
    route.value.search,
    { reload: true },
  );
}
</script>

<template>
  <main data-testid="home">
    <h1>Home (full SSR)</h1>
    <p data-testid="greeting">{{ data?.greeting ?? "(no data)" }}</p>
    <p v-if="data?.fetchedAt !== undefined" data-testid="fetched-at">
      {{ data.fetchedAt }}
    </p>
    <p v-if="data?.aborts !== undefined" data-testid="aborts">
      {{ data.aborts }}
    </p>
    <button
      type="button"
      data-testid="refresh-btn"
      @click="handleRefresh"
    >
      Refresh data
    </button>
  </main>
</template>
