<script setup lang="ts">
import { useNavigator, useRoute } from "@real-router/vue";
import { computed } from "vue";

const { route } = useRoute();
const navigator = useNavigator();

const search = computed(() => route.value.search);
const query = computed(() => (search.value.q as string | undefined) ?? "");
const page = computed(() => (search.value.page as number | undefined) ?? 1);
const sort = computed(
  () => (search.value.sort as string | undefined) ?? "name",
);

function setSearch(value: string) {
  void navigator.navigate(
    "products",
    {},
    {
      ...search.value,
      q: value || undefined,
      page: 1,
    },
  );
}

function setPage(newPage: number) {
  void navigator.navigate(
    "products",
    {},
    {
      ...search.value,
      page: newPage,
    },
  );
}

function setSort(value: string) {
  void navigator.navigate(
    "products",
    {},
    {
      ...search.value,
      sort: value,
      page: 1,
    },
  );
}

function tryInvalid() {
  void navigator.navigate("products", {}, { page: -1, sort: "invalid" });
}
</script>

<template>
  <div>
    <h1>Products</h1>

    <div class="card">
      <h3>Current Params</h3>
      <p style="margin-top: 8px">
        <code>q={{ query || "(empty)" }}, page={{ page }}, sort={{ sort }}</code>
      </p>
      <p style="margin-top: 4px; font-size: 13px; color: #888">
        These params are validated by searchSchema on every navigation.
      </p>
    </div>

    <div
      style="
        display: flex;
        gap: 12px;
        margin-top: 16px;
        flex-wrap: wrap;
        align-items: flex-end;
      "
    >
      <div class="form-group">
        <label for="search-input">Search</label>
        <input
          id="search-input"
          type="text"
          placeholder="Search products…"
          :value="query"
          @input="setSearch(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="form-group">
        <label for="sort-select">Sort by</label>
        <select
          id="sort-select"
          :value="sort"
          @change="setSort(($event.target as HTMLSelectElement).value)"
        >
          <option value="name">Name</option>
          <option value="price">Price</option>
          <option value="date">Date</option>
        </select>
      </div>

      <div
        style="
          display: flex;
          gap: 8px;
          align-items: flex-end;
          padding-top: 18px;
        "
      >
        <button :disabled="page <= 1" @click="setPage(page - 1)">
          Previous
        </button>
        <span style="padding: 8px 4px; font-size: 14px">
          Page <strong>{{ page }}</strong>
        </span>
        <button @click="setPage(page + 1)">Next</button>
      </div>
    </div>

    <div style="margin-top: 16px">
      <p style="margin-bottom: 8px"><strong>Try invalid values:</strong></p>
      <button class="danger" @click="tryInvalid">
        /products?page=-1&amp;sort=invalid
      </button>
      <p style="margin-top: 8px; font-size: 13px; color: #888">
        The plugin validates and replaces invalid values with schema defaults.
        Check the browser console for validation warnings.
      </p>
    </div>
  </div>
</template>
