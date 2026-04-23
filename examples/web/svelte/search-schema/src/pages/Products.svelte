<script lang="ts">
  import { useRoute, useNavigator, Link } from "@real-router/svelte";

  const { route } = useRoute();
  const navigator = useNavigator();

  let params = $derived(route.current?.params ?? {});
  let query = $derived((params.q as string | undefined) ?? "");
  let page = $derived((params.page as number | undefined) ?? 1);
  let sort = $derived((params.sort as string | undefined) ?? "name");

  function setSearch(value: string) {
    void navigator.navigate("products", {
      ...params,
      q: value || undefined,
      page: 1,
    });
  }

  function setPage(newPage: number) {
    void navigator.navigate("products", {
      ...params,
      page: newPage,
    });
  }

  function setSort(value: string) {
    void navigator.navigate("products", {
      ...params,
      sort: value,
      page: 1,
    });
  }
</script>

<div>
  <h1>Products</h1>

  <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center">
    <div class="form-group" style="margin-bottom: 0">
      <label for="search">Search</label>
      <input
        id="search"
        type="text"
        placeholder="Search products…"
        value={query}
        oninput={(e) => { setSearch((e.target as HTMLInputElement).value); }}
      />
    </div>

    <div class="form-group" style="margin-bottom: 0">
      <label for="sort">Sort by</label>
      <select id="sort" value={sort} onchange={(e) => { setSort((e.target as HTMLSelectElement).value); }}>
        <option value="name">Name</option>
        <option value="price">Price</option>
        <option value="date">Date</option>
      </select>
    </div>

    <div style="display: flex; gap: 8px; align-items: flex-end; padding-top: 18px">
      <button disabled={page <= 1} onclick={() => { setPage(page - 1); }}>
        ← Prev
      </button>
      <span style="padding: 8px 4px; font-size: 14px">
        Page <strong>{page}</strong>
      </span>
      <button onclick={() => { setPage(page + 1); }}>Next →</button>
    </div>
  </div>

  <div class="card">
    <p><strong>Validated params from URL:</strong></p>
    <pre style="margin-top: 8px; font-size: 13px; background: #f5f5f5; padding: 12px; border-radius: 4px">{JSON.stringify({ q: query || undefined, page, sort }, null, 2)}</pre>
  </div>

  <div style="margin-top: 16px">
    <p style="margin-bottom: 8px"><strong>Try invalid values:</strong></p>
    <Link
      routeName="products"
      routeParams={{ page: -1, sort: "invalid" }}
      style="color: #c62828; text-decoration: underline"
    >
      /products?page=-1&amp;sort=invalid
    </Link>
    <p style="margin-top: 8px; font-size: 13px; color: #888">
      The plugin validates and replaces invalid values with schema defaults.
      Check the browser console for validation warnings.
    </p>
  </div>
</div>
