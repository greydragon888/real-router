import { Link } from "@real-router/solid";

import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Search Schema Plugin</h1>
      <p>
        This example demonstrates <code>@real-router/search-schema-plugin</code>{" "}
        — runtime validation of URL search parameters using Zod schemas.
      </p>
      <div class="card">
        <h3>What it does</h3>
        <ul style={{ "padding-left": "20px", "margin-top": "8px" }}>
          <li>
            Validates <code>page</code>, <code>sort</code>, and <code>q</code>{" "}
            params against a Zod schema
          </li>
          <li>Invalid params are stripped and replaced with route defaults</li>
          <li>
            Uses <code>numberFormat: &quot;auto&quot;</code> so{" "}
            <code>page</code> is a real number, not a string
          </li>
        </ul>
      </div>
      <div style={{ "margin-top": "16px" }}>
        <Link routeName="products">
          <button class="primary">Go to Products</button>
        </Link>
      </div>
    </div>
  );
}
