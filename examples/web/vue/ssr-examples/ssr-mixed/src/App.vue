<script setup lang="ts">
import { UNKNOWN_ROUTE } from "@real-router/core";
import { Link, useRoute } from "@real-router/vue";
import { computed } from "vue";

import Admin from "./pages/Admin.vue";
import Doc from "./pages/Doc.vue";
import Home from "./pages/Home.vue";
import NotFound from "./pages/NotFound.vue";
import UserProfile from "./pages/UserProfile.vue";

const { route } = useRoute();
const name = computed(() => route.value.name);
</script>

<template>
  <div>
    <nav>
      <Link routeName="home">Home</Link>
      {{ " | " }}
      <Link routeName="admin.dashboard">Admin (client-only)</Link>
      {{ " | " }}
      <Link routeName="users.profile" :routeParams="{ id: '42' }">
        User 42 (data-only)
      </Link>
      {{ " | " }}
      <Link routeName="docs.detail" :routeParams="{ id: 'guide' }">
        Doc HTML
      </Link>
      {{ " | " }}
      <Link
        routeName="docs.detail"
        :routeParams="{ id: 'guide' }"
        :routeSearch="{ format: 'pdf' }"
      >
        Doc PDF (client-only)
      </Link>
    </nav>
    <hr />
    <Home v-if="name === 'home'" />
    <Admin v-else-if="name === 'admin.dashboard'" />
    <UserProfile v-else-if="name === 'users.profile'" />
    <Doc v-else-if="name === 'docs.detail'" />
    <NotFound v-else-if="name === UNKNOWN_ROUTE" />
  </div>
</template>
