import { Link, useRoute } from "@real-router/react";
import { useMemo } from "react";

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
  const { route } = useRoute<{ filter?: Filter }>();
  const filter = route?.params.filter ?? "all";

  const visible = useMemo(() => {
    return filter === "all"
      ? ITEMS
      : ITEMS.filter((item) => item.category === filter);
  }, [filter]);

  return (
    <div data-route-root data-route-anim="fade" data-route-scope="queryDemo">
      <h1>Query-only navigation</h1>
      <p>
        Changing the filter via query params is a same-route navigation (
        <code>route.name === nextRoute.name</code>). Policy detects this and
        skips the leave marker entirely — the page does not fade. Compare with
        the parallel <code>view-transitions/</code> example, which uses{" "}
        <code>html.vt-query-only</code> + a <code>::view-transition</code>{" "}
        suppression rule for the same effect.
      </p>

      <div className="qd-toolbar">
        {(["all", "letter", "number", "color"] as Filter[]).map((value) => (
          <Link
            key={value}
            routeName="queryDemo"
            routeParams={{ filter: value }}
            ignoreQueryParams={false}
          >
            {value}
          </Link>
        ))}
      </div>

      <ul className="qd-list">
        {visible.map((item) => (
          <li key={item.id} className="qd-item" data-flip-key={item.id}>
            <strong>{item.label}</strong>
            <span> — {item.category}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
