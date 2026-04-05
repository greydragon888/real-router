import { Link, useNavigator, useRoute } from "@real-router/react";

import type { JSX } from "react";

export function Products(): JSX.Element {
  const { route } = useRoute();
  const navigator = useNavigator();

  const q = (route?.params.q as string | undefined) ?? "";
  const page = (route?.params.page as number | undefined) ?? 1;
  const sort = (route?.params.sort as string | undefined) ?? "name";

  const navigate = (
    params: Record<string, string | number | boolean | undefined>,
  ) => {
    void navigator.navigate("products", { ...route?.params, ...params });
  };

  return (
    <div>
      <h1>Products</h1>

      <div className="card">
        <h3>Current Params</h3>
        <p style={{ marginTop: "8px" }}>
          <code>
            q={q || "(empty)"}, page={page}, sort={sort}
          </code>
        </p>
        <p
          style={{
            marginTop: "4px",
            fontSize: "13px",
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
          marginTop: "16px",
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <div className="form-group">
          <label htmlFor="search-input">Search</label>
          <input
            id="search-input"
            type="text"
            value={q}
            placeholder="Search products..."
            onChange={(e) => {
              const value = e.target.value;

              navigate(
                value ? { q: value, page: 1 } : { q: undefined, page: 1 },
              );
            }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="sort-select">Sort by</label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => {
              navigate({ sort: e.target.value });
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
          marginTop: "16px",
          alignItems: "center",
        }}
      >
        <button
          disabled={page <= 1}
          onClick={() => {
            navigate({ page: page - 1 });
          }}
        >
          ← Previous
        </button>
        <span>
          Page <strong>{page}</strong>
        </span>
        <button
          onClick={() => {
            navigate({ page: page + 1 });
          }}
        >
          Next →
        </button>
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <h3>Try Invalid Params</h3>
        <p style={{ marginTop: "8px" }}>
          Click the link below to navigate with invalid params. The schema will
          reject them and restore defaults.
        </p>
        <div style={{ marginTop: "8px" }}>
          <Link
            routeName="products"
            routeParams={{ page: -1, sort: "invalid" }}
          >
            <button className="danger">/products?page=-1&sort=invalid</button>
          </Link>
        </div>
        <p
          style={{
            marginTop: "8px",
            fontSize: "13px",
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
