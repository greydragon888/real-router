<script setup lang="ts">
import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/vue";

import UserProfile from "./UserProfile.vue";
import UserSettings from "./UserSettings.vue";
import UsersList from "./UsersList.vue";

import { computed } from "vue";

import type { Params } from "@real-router/core";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.list": "List",
  "users.settings": "Settings",
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
  if (!route.value) return [];
  const chain = utils.getChain(route.value.name) ?? [route.value.name];
  return ["home", ...chain];
});
</script>

<template>
  <div v-if="usersRoute">
    <nav v-if="route" class="breadcrumbs" aria-label="breadcrumb">
      <template v-for="(name, i) in crumbs" :key="name">
        <span v-if="i > 0"> › </span>
        <span v-if="i === crumbs.length - 1">{{
          getLabel(name, route.params)
        }}</span>
        <Link v-else :routeName="name">{{ getLabel(name, route.params) }}</Link>
      </template>
    </nav>

    <div :style="{ display: 'flex', gap: '24px', marginTop: '16px' }">
      <nav :style="{ minWidth: '140px' }">
        <p
          :style="{
            fontSize: '12px',
            textTransform: 'uppercase',
            color: '#888',
            marginBottom: '8px',
          }"
        >
          Users
        </p>
        <Link
          routeName="users.list"
          activeClassName="active"
          :style="{
            display: 'block',
            padding: '6px 12px',
            textDecoration: 'none',
            color: '#555',
            borderRadius: '4px',
          }"
        >
          List
        </Link>
        <Link
          routeName="users.settings"
          activeClassName="active"
          :style="{
            display: 'block',
            padding: '6px 12px',
            textDecoration: 'none',
            color: '#555',
            borderRadius: '4px',
          }"
        >
          Settings
        </Link>
      </nav>

      <div :style="{ flex: 1 }">
        <RouteView nodeName="users">
          <RouteView.Match segment="list">
            <UsersList />
          </RouteView.Match>
          <RouteView.Match segment="profile">
            <UserProfile />
          </RouteView.Match>
          <RouteView.Match segment="settings">
            <UserSettings />
          </RouteView.Match>
        </RouteView>
      </div>
    </div>
  </div>
</template>
