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
    <div data-route-root data-route-anim="fade">
      <h1>Query-only navigation</h1>
      <p>
        Changing the filter via query params is a same-route navigation (
        <code>route.name === nextRoute.name</code>). <code>useRouteExit</code>{" "}
        detects this via its default <code>skipSameRoute: true</code> and skips
        the page-level fade entirely — the page does not animate.{" "}
        <code>useListFlip</code> opts in via <code>skipSameRoute: false</code>{" "}
        to own the same-route window: items glide between positions, newcomers
        fade in, removed items fade out via ghost clones.
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
            <li class="qd-item" data-flip-key={item.id}>
              <strong>{item.label}</strong>
              <span> — {item.category}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
