import { Link, useRoute } from "@real-router/solid";
import { For, createMemo } from "solid-js";

import { useListFlip } from "../use-list-flip";
import { useRouteAnimation } from "../use-route-animation";

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
  // eslint-disable-next-line no-unassigned-vars -- assigned by Solid ref={ref} JSX binding
  let ref: HTMLDivElement | undefined;
  const setListRef = useListFlip<HTMLUListElement>();

  useRouteAnimation(() => ref, {
    entryClass: "fade-in",
    exitClass: "fade-out",
  });

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
    <div ref={ref}>
      <h1>Query-only navigation</h1>
      <p>
        Click a filter — the page itself does not fade because the hook's
        default <code>skipSameRoute: true</code> short-circuits when{" "}
        <code>route.name === nextRoute.name</code>. Three coordinated WAAPI
        animations play instead, all driven by <code>useListFlip</code>:
        survivors translate from old to new positions (inverse-FLIP from a{" "}
        <code>getBoundingClientRect</code> diff in <code>createEffect</code>);
        newly-visible items fade in; items removed by a narrowing filter fade
        out via cloned ghosts reconstructed from <code>outerHTML</code> and
        pinned at their last-known rect. View-local — no router events, no
        shared state between components.
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

      <ul class="qd-list" ref={setListRef}>
        <For each={visible()}>
          {(item) => (
            <li data-flip-key={item.id} class="qd-item">
              <strong>{item.label}</strong>
              <span> — {item.category}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
