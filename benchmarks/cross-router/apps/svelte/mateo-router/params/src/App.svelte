<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import Home from "../../../_shared/Home.svelte";
  import {
    PARAM_COUNTS,
    paramKeys,
    paramPath,
  } from "../../../_shared/param-spec";
  import ParamLeaf from "./ParamLeaf.svelte";

  // mateo paths are regex: one named capture group (?<kX>[^/]+) per param. Must NOT
  // anchor with ^…$ — mateo's Route ctor runs normalize(), which prepends "/" to any
  // path not starting with "/", corrupting a leading ^ into "/^…". Unanchored is safe
  // here: the "/pN/" prefixes are delimiter-distinct (/p1/ can't prefix-match /p10/),
  // so exactly one pN route matches. The matcher extracts all N groups; the leaf
  // counts them (data-count) so the driver can confirm arrival at each param size.
  function pattern(n: number): string {
    return `/p${n}/${paramKeys(n)
      .map((k) => `(?<${k}>[^/]+)`)
      .join("/")}`;
  }

  const routes: RouteConfig[] = [
    { path: "/", component: Home },
    ...PARAM_COUNTS.map((n) => ({ path: pattern(n), component: ParamLeaf })),
  ];
</script>

<nav>
  {#each PARAM_COUNTS as n (n)}
    <a href={paramPath(n)} use:routeAction data-testid={`link-param-${n}`}>
      {n}
    </a>
  {/each}
</nav>
<Router {routes} />
