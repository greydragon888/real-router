<script lang="ts">
  import { useRouteNode, createLinkAction } from "@real-router/svelte";

  const { route } = useRouteNode("products.detail");
  const link = createLinkAction();

  const id = $derived(
    route.current && typeof route.current.params.id === "string"
      ? route.current.params.id
      : "?"
  );
</script>

<div>
  <h1>Product #{id}</h1>
  <div class="card">
    <p>Product detail page — navigated here via <code>use:link</code> action on a card div.</p>
    <p>The action adds <code>role="link"</code> and <code>tabindex="0"</code> for accessibility.</p>
  </div>
  <button use:link={{ name: "home" }}>← Back to Home (use:link on button)</button>
</div>
