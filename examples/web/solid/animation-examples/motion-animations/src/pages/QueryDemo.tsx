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
const FILTERS: Filter[] = ["all", "letter", "number", "color"];

export function QueryDemo(): JSX.Element {
  const routeState = useRoute();
  const filter = createMemo<Filter>(
    () => (routeState().route.search.filter as Filter | undefined) ?? "all",
  );

  const visible = createMemo(() => {
    const current = filter();

    return current === "all"
      ? ITEMS
      : ITEMS.filter((item) => item.category === current);
  });

  return (
    <div>
      <h1>Query-only navigation</h1>
      <p>
        Switch a filter — the page-level Motion.div does not exit/enter because
        filter changes are same-route (
        <code>route.name === nextRoute.name</code>) and{" "}
        <code>useRouteExit</code>'s default <code>skipSameRoute: true</code>{" "}
        short-circuits before the exitToken bumps. The <code>{`<For>`}</code>{" "}
        re-renders the visible items array in place. Motion One does not ship
        list-layout primitives, so individual items do not glide between
        positions — for that effect in Solid, see <code>page-animations/</code>{" "}
        → <code>useListFlip</code>.
      </p>

      <div class="qd-toolbar">
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

      <ul class="qd-list">
        <For each={visible()}>
          {(item) => (
            <li class="qd-item">
              <strong>{item.label}</strong>
              <span> — {item.category}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
