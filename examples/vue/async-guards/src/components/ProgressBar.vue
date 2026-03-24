<script setup lang="ts">
import { useRouterTransition } from "@real-router/vue";

const transition = useRouterTransition();
</script>

<template>
  <div
    v-if="transition?.isTransitioning"
    class="progress-bar"
    :style="{ width: '100%' }"
  />
</template>
