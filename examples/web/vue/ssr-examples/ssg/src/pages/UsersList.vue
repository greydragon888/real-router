<script setup lang="ts">
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

import type { UsersListData } from "../router/loaders";

const { route } = useRoute();
const data = computed<UsersListData>(
  () =>
    (route.value.context.data as UsersListData | undefined) ?? { users: [] },
);
</script>

<template>
  <div>
    <h2>All Users</h2>
    <ul>
      <li v-for="user in data.users" :key="user.id">
        <Link routeName="users.profile" :routeParams="{ id: user.id }">
          {{ user.name }}
        </Link>
      </li>
    </ul>
  </div>
</template>
