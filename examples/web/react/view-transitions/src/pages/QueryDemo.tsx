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
    <div>
      <h1>Query-only navigation</h1>
      <p>
        Changing the filter via query params is still a navigation, so VT
        runs. The <strong>inner list container</strong> has its own{" "}
        <code>view-transition-name: query-demo-list</code> — only this area
        animates, while the page header and buttons stay fixed.
      </p>

      <div className="vt-qd-toolbar">
        {(["all", "letter", "number", "color"] as Filter[]).map((value) => (
          <Link
            key={value}
            routeName="queryDemo"
            routeParams={{ filter: value }}
            activeClassName="active"
          >
            {value}
          </Link>
        ))}
      </div>

      <ul className="vt-qd-list" data-vt-scope="query-demo-list">
        {visible.map((item) => (
          <li key={item.id} className="vt-qd-item">
            <strong>{item.label}</strong>
            <span> — {item.category}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
