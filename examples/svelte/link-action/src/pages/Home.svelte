<script lang="ts">
  import { createLinkAction } from "@real-router/svelte";

  const link = createLinkAction();

  const products = [
    { id: "1", name: "Laptop", price: 999 },
    { id: "2", name: "Keyboard", price: 79 },
    { id: "3", name: "Monitor", price: 449 },
  ];
</script>

<div>
  <h1>Home</h1>
  <p>
    This example demonstrates <code>createLinkAction()</code> — the Svelte action
    factory that adds navigation to any element via <code>use:link</code>.
  </p>

  <h2>Product Cards (use:link on div)</h2>
  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px">
    {#each products as product}
      <div
        class="card"
        use:link={{ name: "products.detail", params: { id: product.id } }}
        style="cursor: pointer"
      >
        <strong>{product.name}</strong>
        <p>${product.price}</p>
      </div>
    {/each}
  </div>

  <h2 style="margin-top: 24px">Links (use:link on a)</h2>
  <p>
    <a use:link={{ name: "about" }}>About page (use:link on anchor)</a>
  </p>

  <h2 style="margin-top: 24px">Buttons (use:link on button)</h2>
  <button use:link={{ name: "about" }}>Go to About (use:link on button)</button>
</div>
