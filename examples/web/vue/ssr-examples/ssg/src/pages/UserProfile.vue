<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

import type { UserProfileData } from "../router/loaders";

const { route } = useRoute();
const data = computed<UserProfileData | undefined>(
  () => route.value.context.data as UserProfileData | undefined,
);
</script>

<template>
  <div v-if="!data?.user">
    <h2>User Profile</h2>
    <p>User not found.</p>
  </div>
  <div v-else>
    <h2>User Profile</h2>
    <p>ID: {{ data.user.id }}</p>
    <p>Name: {{ data.user.name }}</p>
  </div>
</template>
