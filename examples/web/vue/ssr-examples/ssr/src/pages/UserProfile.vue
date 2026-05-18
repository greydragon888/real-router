<script setup lang="ts">
import { Link, RouteView, useRoute } from "@real-router/vue";
import { computed, ref } from "vue";

import UserPosts from "./UserPosts.vue";

import type { UserProfileData } from "../router/loaders";

const { route } = useRoute();
const data = computed<UserProfileData | undefined>(
  () => route.value.context.data as UserProfileData | undefined,
);

// Demo state for the v-track-view directive's update lifecycle.
// Initially the directive observes the user.id; clicking "Override
// tracked id" flips the bound value to a fixed string. Vue detects
// the binding change and calls the directive's `updated()` hook with
// the new value (no remount). See src/directives/track-view.ts.
const manualOverride = ref<string | null>(null);
const trackedId = computed<string>(
  () => manualOverride.value ?? (data.value?.user?.id ?? ""),
);
</script>

<template>
  <div v-if="!data?.user">
    <h2>User Profile</h2>
    <p data-testid="user-not-found">User not found.</p>
  </div>
  <div
    v-else
    v-track-view="{ productId: trackedId }"
    data-testid="user-profile"
    :data-user-id="data.user.id"
  >
    <h2>User Profile</h2>
    <p data-testid="user-id">ID: {{ data.user.id }}</p>
    <p data-testid="user-name">Name: {{ data.user.name }}</p>
    <p data-testid="user-role">Role: {{ data.user.role }}</p>

    <button
      type="button"
      data-testid="override-tracked-id"
      @click="manualOverride = '999'"
    >
      Override tracked id
    </button>

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
