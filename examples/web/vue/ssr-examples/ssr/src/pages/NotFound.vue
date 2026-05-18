<script setup lang="ts">
// Render-time HTTP status declaration: the NotFound page declares its own
// 404 via <HttpStatusCode/>. The server-side <HttpStatusProvider :sink>
// wired in entry-server.ts captures the value into a request-scoped sink
// and applies it to the response. On the client (post-hydration) the
// component is a silent no-op — no provider mounted, no DOM written.
import { HttpStatusCode } from "@real-router/vue/ssr";
</script>

<template>
  <div>
    <HttpStatusCode :code="404" />
    <h1>404 — Not Found</h1>
    <p>The page you are looking for does not exist.</p>
  </div>
</template>
