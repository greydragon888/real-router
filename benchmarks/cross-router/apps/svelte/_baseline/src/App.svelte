<script lang="ts">
  // Bare Svelte, NO router — manual view state + history.pushState. The FLOOR:
  // cold-start + one navigation with zero router overhead (router work = engine − baseline).
  import About from "../../_shared/About.svelte";
  import Home from "../../_shared/Home.svelte";

  let view = $state(location.pathname === "/about" ? "about" : "home");

  const go = (v: "home" | "about", path: string) => (event: MouseEvent) => {
    event.preventDefault();
    history.pushState(null, "", path);
    view = v;
  };
</script>

<nav>
  <a href="/" data-testid="link-home" onclick={go("home", "/")}>Home</a>
  <a href="/about" data-testid="link-about" onclick={go("about", "/about")}>About</a>
</nav>
{#if view === "home"}<Home />{:else}<About />{/if}
