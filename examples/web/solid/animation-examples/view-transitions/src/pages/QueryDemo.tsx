import { Link, useRoute } from "@real-router/solid";
import { For, createMemo } from "solid-js";

import type { JSX } from "solid-js";

const ITEMS = [
  { id: "alpha", label: "Alpha", category: "letter" },
  { id: "bravo", label: "Bravo", category: "letter" },
  { id: "one", label: "One", category: "number" },
  { id: "two", label: "Two", category: "number" },
  { id: "red", label: "Red", category: "color" },
  { id: "blue", label: "Blue", category: "color" },
];

type Filter = "all" | "letter" | "number" | "color";

export function QueryDemo(): JSX.Element {
  // useRoute re-renders on every navigation (including query-only changes
  // on the same route). useRouteNode would only re-render when the node
  // activates/deactivates — so a filter=all → filter=letter change would
  // leave `filter` frozen at "all" forever, and all buttons would look
  // like the initial active one.
  const routeState = useRoute();

  const filter = createMemo<Filter>(
    () => (routeState().route.search.filter as Filter | undefined) ?? "all",
  );

  const visible = createMemo(() =>
    filter() === "all"
      ? ITEMS
      : ITEMS.filter((item) => item.category === filter()),
  );

  const FILTERS: Filter[] = ["all", "letter", "number", "color"];

  return (
    <div>
      <h1>Query-only navigation</h1>
      <p>
        Changing the filter via query params is still a navigation, so VT runs.
        The <strong>inner list container</strong> has its own{" "}
        <code>view-transition-name: query-demo-list</code> — only this area
        animates, while the page header and buttons stay fixed.
      </p>

      <div class="vt-qd-toolbar">
        <For each={FILTERS}>
          {(value) => (
            <Link
              routeName="queryDemo"
              routeSearch={{ filter: value }}
              ignoreQueryParams={false}
            >
              {value}
            </Link>
          )}
        </For>
      </div>

      <ul class="vt-qd-list" data-vt-scope="query-demo-list">
        <For each={visible()}>
          {(item) => (
            <li
              class="vt-qd-item"
              style={{ "--vt-qd-name": `vt-qd-${item.id}` }}
            >
              <strong>{item.label}</strong>
              <span> — {item.category}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
