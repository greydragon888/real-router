<script setup lang="ts">
import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/vue";

import UserProfile from "./UserProfile.vue";
import UsersList from "./UsersList.vue";

import { computed } from "vue";

import type { Params } from "@real-router/core";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.profile.settings": "Settings",
};

function getLabel(name: string, params: Params): string {
  if (name in routeLabels) {
    return routeLabels[name];
  }

  if (name === "users.profile") {
    const id = typeof params.id === "string" ? params.id : "?";

    return `User #${id}`;
  }

  return name;
}

const { route: usersRoute } = useRouteNode("users");
const { route } = useRoute();
const utils = useRouteUtils();

const crumbs = computed(() => {
  const chain = utils.getChain(route.value.name) ?? [route.value.name];
  return ["home", ...chain];
});
</script>

<template>
  <div v-if="usersRoute">
    <nav class="breadcrumbs" aria-label="breadcrumb">
      <template v-for="(name, i) in crumbs" :key="name">
        <span v-if="i > 0"> › </span>
        <span v-if="i === crumbs.length - 1">{{
          getLabel(name, route.params)
        }}</span>
        <Link v-else :routeName="name">{{ getLabel(name, route.params) }}</Link>
      </template>
    </nav>

    <div :style="{ marginTop: '16px' }">
      <!--
        `users` route IS the list — no synthetic `list` child / forwardTo.
        <RouteView.Self> renders UsersList when active route is exactly
        `users`; <RouteView.Match segment="profile"> wins for /users/:id and
        deeper (UserProfile owns its own sub-navigation).
      -->
      <RouteView nodeName="users">
        <RouteView.Self>
          <UsersList />
        </RouteView.Self>
        <RouteView.Match segment="profile">
          <UserProfile />
        </RouteView.Match>
      </RouteView>
    </div>
  </div>
</template>
