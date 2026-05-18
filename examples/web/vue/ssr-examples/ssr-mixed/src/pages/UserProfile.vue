<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

interface ProfileData {
  id: string;
  name: string;
}

const { route } = useRoute();
const data = computed(
  () => route.value.context.data as ProfileData | undefined,
);
</script>

<template>
  <main data-testid="user-profile">
    <h1>User profile (data-only)</h1>
    <p data-testid="profile-shell">
      Server fetched the data and shipped JSON; this shell renders without
      SSR'd HTML, the client hydrates from
      <code>__SSR_STATE__.context.data</code>.
    </p>
    <p v-if="data" data-testid="profile-data">
      {{ data.id }} — {{ data.name }}
    </p>
  </main>
</template>
