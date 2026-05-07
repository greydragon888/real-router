<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

interface HomeData {
  greeting: string;
}

const { route } = useRoute();
const data = computed(() => route.value.context.data as HomeData | undefined);
</script>

<template>
  <main data-testid="home">
    <h1>Home (full SSR)</h1>
    <p data-testid="greeting">{{ data?.greeting ?? "(no data)" }}</p>
  </main>
</template>
