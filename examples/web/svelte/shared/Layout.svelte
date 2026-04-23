<script lang="ts">
  import { Link } from "@real-router/svelte";
  import type { Snippet } from "svelte";

  interface NavLink {
    routeName: string;
    label: string;
  }

  let { title, links, children }: { title: string; links: NavLink[]; children: Snippet } = $props();
</script>

<div class="app">
  <header class="header">{title}</header>
  <aside class="sidebar">
    {#each links as link}
      <Link routeName={link.routeName} activeClassName="active">
        {link.label}
      </Link>
    {/each}
  </aside>
  <main class="content">
    {@render children?.()}
  </main>
  <footer class="footer">@real-router/svelte</footer>
</div>
