<template>
  <div>
    <h1>Checkout</h1>
    <p>You reached checkout — the async guard passed (cart has items).</p>
    <div class="card">
      <p>The <code>canActivate</code> guard on this route:</p>
      <ol :style="{ paddingLeft: '20px', lineHeight: '1.8' }">
        <li>Simulates a 500ms API call to check cart contents</li>
        <li>
          Returns <code>true</code> when cart has items, <code>false</code> when
          empty
        </li>
        <li>
          Listens to <code>AbortSignal</code> — cancels if a new navigation
          starts
        </li>
      </ol>
    </div>
  </div>
</template>
