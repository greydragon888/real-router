<script lang="ts">
  import { createLinkAction } from "@real-router/svelte";

  const link = createLinkAction();
</script>

<div>
  <h1>About</h1>
  <p>
    You navigated here using <code>use:link</code> — the Svelte action for navigation.
  </p>
  <p>
    <code>createLinkAction()</code> captures the router context during component init,
    then returns an action usable on any element.
  </p>
  <div use:link={{ name: "home", params: {}, options: { replace: true } }} class="card" style="cursor: pointer">
    <strong>Click this card to go Home</strong>
    <p>This div uses <code>use:link</code> with <code>replace: true</code>.</p>
  </div>
</div>
