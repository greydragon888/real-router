import { Link, useNavigator, useRoute } from "@real-router/solid";

import type { JSX } from "solid-js";

export function Products(): JSX.Element {
  const routeState = useRoute();
  const navigator = useNavigator();

  const q = () => (routeState().route?.params.q as string | undefined) ?? "";
  const page = () =>
    (routeState().route?.params.page as number | undefined) ?? 1;
  const sort = () =>
    (routeState().route?.params.sort as string | undefined) ?? "name";

  const navigate = (
    params: Record<string, string | number | boolean | undefined>,
  ) => {
    const route = routeState().route;

    void navigator.navigate("products", { ...route?.params, ...params });
  };

  return (
    <div>
      <h1>Products</h1>

      <div class="card">
        <h3>Current Params</h3>
        <p style={{ "margin-top": "8px" }}>
          <code>
            q={q() || "(empty)"}, page={page()}, sort={sort()}
          </code>
        </p>
        <p
          style={{
            "margin-top": "4px",
            "font-size": "13px",
            color: "#888",
          }}
        >
          These params are validated by searchSchema on every navigation.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: "12px",
          "margin-top": "16px",
          "align-items": "flex-end",
          "flex-wrap": "wrap",
        }}
      >
        <div class="form-group">
          <label for="search-input">Search</label>
          <input
            id="search-input"
            type="text"
            value={q()}
            placeholder="Search products..."
            onInput={(e) => {
              const value = e.currentTarget.value;

              navigate(
                value ? { q: value, page: 1 } : { q: undefined, page: 1 },
              );
            }}
          />
        </div>

        <div class="form-group">
          <label for="sort-select">Sort by</label>
          <select
            id="sort-select"
            value={sort()}
            onChange={(e) => {
              navigate({ sort: e.currentTarget.value });
            }}
          >
            <option value="name">Name</option>
            <option value="price">Price</option>
            <option value="date">Date</option>
          </select>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          "margin-top": "16px",
          "align-items": "center",
        }}
      >
        <button
          disabled={page() <= 1}
          onClick={() => {
            navigate({ page: page() - 1 });
          }}
        >
          ← Previous
        </button>
        <span>
          Page <strong>{page()}</strong>
        </span>
        <button
          onClick={() => {
            navigate({ page: page() + 1 });
          }}
        >
          Next →
        </button>
      </div>

      <div class="card" style={{ "margin-top": "16px" }}>
        <h3>Try Invalid Params</h3>
        <p style={{ "margin-top": "8px" }}>
          Click the link below to navigate with invalid params. The schema will
          reject them and restore defaults.
        </p>
        <div style={{ "margin-top": "8px" }}>
          <Link
            routeName="products"
            routeParams={{ page: -1, sort: "invalid" }}
          >
            <button class="danger">/products?page=-1&sort=invalid</button>
          </Link>
        </div>
        <p
          style={{
            "margin-top": "8px",
            "font-size": "13px",
            color: "#888",
          }}
        >
          Open the browser console to see the validation error logged by the
          plugin in development mode.
        </p>
      </div>
    </div>
  );
}
