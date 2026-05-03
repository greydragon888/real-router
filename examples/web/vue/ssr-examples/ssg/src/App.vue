<script setup lang="ts">
import { Link, RouteView } from "@real-router/vue";

import Home from "./pages/Home.vue";
import NotFound from "./pages/NotFound.vue";
import UserProfile from "./pages/UserProfile.vue";
import UsersList from "./pages/UsersList.vue";
</script>

<template>
  <div>
    <nav>
      <Link routeName="home">Home</Link>
      {{ " | " }}
      <Link routeName="users">Users</Link>
    </nav>
    <main>
      <RouteView nodeName="">
        <RouteView.Match segment="home">
          <Home />
        </RouteView.Match>
        <RouteView.Match segment="users">
          <h1>Users</h1>
          <RouteView nodeName="users">
            <RouteView.Self>
              <UsersList />
            </RouteView.Self>
            <RouteView.Match segment="profile">
              <UserProfile />
            </RouteView.Match>
          </RouteView>
        </RouteView.Match>
        <RouteView.NotFound>
          <NotFound />
        </RouteView.NotFound>
      </RouteView>
    </main>
  </div>
</template>
