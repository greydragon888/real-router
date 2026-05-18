<script setup lang="ts">
import { Link, RouteView, useRoute } from "@real-router/vue";
import { computed } from "vue";

import UserPosts from "./UserPosts.vue";

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
  <div v-else data-testid="user-profile" :data-user-id="data.user.id">
    <h2>User Profile</h2>
    <p data-testid="user-id">ID: {{ data.user.id }}</p>
    <p data-testid="user-name">Name: {{ data.user.name }}</p>

    <Link
      routeName="users.profile.posts"
      :routeParams="{ id: data.user.id }"
      data-testid="view-posts"
    >
      View posts
    </Link>

    <RouteView nodeName="users.profile">
      <RouteView.Match segment="posts">
        <UserPosts />
      </RouteView.Match>
    </RouteView>
  </div>
</template>
