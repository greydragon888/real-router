<script setup lang="ts">
import { useRoute } from "@real-router/vue";
import { computed } from "vue";

import type { UserPostsData } from "../router/loaders";

const { route } = useRoute();
const data = computed<UserPostsData | undefined>(
  () => route.value.context.data as UserPostsData | undefined,
);
</script>

<template>
  <p v-if="!data">Loading…</p>
  <div v-else-if="data.posts.length === 0" data-testid="user-posts-empty">
    <h3>Posts</h3>
    <p>No posts yet.</p>
  </div>
  <div v-else data-testid="user-posts">
    <h3>Posts</h3>
    <ul>
      <li
        v-for="post in data.posts"
        :key="post.id"
        :data-post-id="post.id"
      >
        {{ post.title }}
      </li>
    </ul>
  </div>
</template>
