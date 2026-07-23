import { Link, useRoute } from "@real-router/react";
import { useMemo, useRef } from "react";

import { useListFlip } from "../use-list-flip";
import { useRouteAnimation } from "../use-route-animation";

import type { JSX } from "react";

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
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useListFlip<HTMLUListElement>();

  useRouteAnimation(ref, { entryClass: "fade-in", exitClass: "fade-out" });

  const { route } = useRoute();
  const filter = route.search.filter ?? "all";

  const visible = useMemo(() => {
    return filter === "all"
      ? ITEMS
      : ITEMS.filter((item) => item.category === filter);
  }, [filter]);

  return (
    <div ref={ref}>
      <h1>Query-only navigation</h1>
      <p>
        Click a filter — the page itself does not fade because the hook&apos;s
        default <code>skipSameRoute: true</code> short-circuits when{" "}
        <code>route.name === nextRoute.name</code>. Three coordinated WAAPI
        animations play instead, all driven by <code>useListFlip</code>:
        survivors translate from old to new positions (inverse-FLIP from a{" "}
        <code>getBoundingClientRect</code> diff in <code>useLayoutEffect</code>
        ); newly-visible items fade in; items removed by a narrowing filter fade
        out via cloned ghosts reconstructed from <code>outerHTML</code> and
        pinned at their last-known rect. View-local — no router events, no
        shared state between components.
      </p>

      <div className="qd-toolbar">
        {(["all", "letter", "number", "color"] as Filter[]).map((value) => (
          <Link
            key={value}
            routeName="queryDemo"
            routeSearch={{ filter: value }}
            ignoreQueryParams={false}
          >
            {value}
          </Link>
        ))}
      </div>

      <ul className="qd-list" ref={listRef}>
        {visible.map((item) => (
          <li key={item.id} data-flip-key={item.id} className="qd-item">
            <strong>{item.label}</strong>
            <span> — {item.category}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
