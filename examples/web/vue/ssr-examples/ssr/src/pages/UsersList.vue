<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

import type { UsersListData } from "../router/loaders";

const { route } = useRoute();
const data = computed<UsersListData>(
  () =>
    (route.value.context.data as UsersListData | undefined) ?? {
      users: [],
      sort: "asc",
    },
);
const otherSort = computed(() => (data.value.sort === "asc" ? "desc" : "asc"));
</script>

<template>
  <div>
    <h2>All Users</h2>
    <p data-testid="current-sort">Sorted: {{ data.sort }}</p>
    <Link
      routeName="users"
      :routeSearch="{ sort: otherSort }"
      data-testid="toggle-sort"
    >
      Toggle to {{ otherSort }}
    </Link>
    <ul data-testid="users-list">
      <li
        v-for="user in data.users"
        :key="user.id"
        :data-user-id="user.id"
      >
        <Link routeName="users.profile" :routeParams="{ id: user.id }">
          {{ user.name }}
        </Link>
        {{ " — " }}
        <span :data-testid="`role-${user.id}`">{{ user.role }}</span>
      </li>
    </ul>
  </div>
</template>
