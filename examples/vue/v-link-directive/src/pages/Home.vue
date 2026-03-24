<script setup lang="ts">
const products = [
  { id: "1", name: "Laptop", price: "$999" },
  { id: "2", name: "Phone", price: "$699" },
  { id: "3", name: "Tablet", price: "$449" },
];
</script>

<template>
  <div>
    <h1>Home</h1>
    <p>
      The cards below use <code>v-link</code> directive on
      <code>&lt;div&gt;</code> elements — not <code>&lt;a&gt;</code> tags. Click
      any card to navigate.
    </p>

    <div
      :style="{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
        marginTop: '16px',
      }"
    >
      <div
        v-for="product in products"
        :key="product.id"
        v-link="{ name: 'products.detail', params: { id: product.id } }"
        class="card"
        role="link"
        tabindex="0"
      >
        <strong>{{ product.name }}</strong>
        <p :style="{ color: '#888' }">{{ product.price }}</p>
      </div>
    </div>

    <div :style="{ marginTop: '24px' }">
      <h2>Other v-link elements</h2>

      <button v-link="{ name: 'checkout' }" :style="{ marginRight: '8px' }">
        Go to Checkout (button)
      </button>

      <a v-link="{ name: 'checkout' }"> Go to Checkout (anchor) </a>
    </div>
  </div>
</template>
