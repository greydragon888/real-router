<script setup lang="ts">
import {
  Link,
  RouteView,
  useRoute,
  useRouteNode,
  useRouteUtils,
} from "@real-router/vue";

import type { Params } from "@real-router/core";

const routeLabels: Record<string, string> = {
  home: "Home",
  users: "Users",
  "users.list": "List",
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

function getCrumbs() {
  if (!route.value) {
    return [];
  }

  const chain = utils.getChain(route.value.name) ?? [route.value.name];

  return ["home", ...chain];
}
</script>

<template>
  <div v-if="usersRoute">
    <nav v-if="route" class="breadcrumbs" aria-label="breadcrumb">
      <template v-for="(name, i) in getCrumbs()" :key="name">
        <span v-if="i > 0"> › </span>
        <span v-if="i === getCrumbs().length - 1">{{
          getLabel(name, route.params)
        }}</span>
        <Link v-else :routeName="name">{{ getLabel(name, route.params) }}</Link>
      </template>
    </nav>

    <div :style="{ display: 'flex', gap: '24px', marginTop: '16px' }">
      <nav :style="{ minWidth: '120px' }">
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
      </nav>
      <div :style="{ flex: 1 }">
        <RouteView nodeName="users">
          <RouteView.Match segment="list">
            <div>
              <h1>Users</h1>
              <div class="card">
                <Link routeName="users.profile" :routeParams="{ id: '1' }"
                  >User #1 — Alice</Link
                >
              </div>
              <div class="card">
                <Link routeName="users.profile" :routeParams="{ id: '2' }"
                  >User #2 — Bob</Link
                >
              </div>
              <div class="card">
                <Link routeName="users.profile" :routeParams="{ id: '3' }"
                  >User #3 — Carol</Link
                >
              </div>
            </div>
          </RouteView.Match>
          <RouteView.Match segment="profile">
            <div>
              <h1>
                User #{{
                  usersRoute && typeof usersRoute.params.id === "string"
                    ? usersRoute.params.id
                    : "?"
                }}
              </h1>
              <div class="card">
                <p>
                  Profile for user
                  {{
                    usersRoute && typeof usersRoute.params.id === "string"
                      ? usersRoute.params.id
                      : "?"
                  }}
                </p>
              </div>
              <Link routeName="users.list">← Back to list</Link>
            </div>
          </RouteView.Match>
        </RouteView>
      </div>
    </div>
  </div>
</template>
