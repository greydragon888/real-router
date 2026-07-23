<script lang="ts">
  import { UNKNOWN_ROUTE } from "@real-router/core";
  import { Link, useRoute } from "@real-router/svelte";

  import Admin from "./pages/Admin.svelte";
  import Doc from "./pages/Doc.svelte";
  import Home from "./pages/Home.svelte";
  import NotFound from "./pages/NotFound.svelte";
  import UserProfile from "./pages/UserProfile.svelte";

  const { route } = useRoute();
  const name = $derived(route.current.name);
</script>

<div>
  <nav>
    <Link routeName="home">Home</Link>
    {" | "}
    <Link routeName="admin.dashboard">Admin (client-only)</Link>
    {" | "}
    <Link routeName="users.profile" routeParams={{ id: "42" }}>
      User 42 (data-only)
    </Link>
    {" | "}
    <Link routeName="docs.detail" routeParams={{ id: "guide" }}>
      Doc HTML
    </Link>
    {" | "}
    <Link
      routeName="docs.detail"
      routeParams={{ id: "guide" }}
      routeSearch={{ format: "pdf" }}
    >
      Doc PDF (client-only)
    </Link>
  </nav>
  <hr />
  {#if name === "home"}
    <Home />
  {:else if name === "admin.dashboard"}
    <Admin />
  {:else if name === "users.profile"}
    <UserProfile />
  {:else if name === "docs.detail"}
    <Doc />
  {:else if name === UNKNOWN_ROUTE}
    <NotFound />
  {/if}
</div>
