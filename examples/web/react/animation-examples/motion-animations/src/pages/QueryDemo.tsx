import { Link, useRoute } from "@real-router/react";
import { AnimatePresence, motion } from "motion/react";
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
  const { route } = useRoute();
  const filter = route.search.filter ?? "all";

  const visible = useMemo(() => {
    return filter === "all"
      ? ITEMS
      : ITEMS.filter((item) => item.category === filter);
  }, [filter]);

  return (
    <div>
      <h1>Query-only navigation</h1>
      <p>
        Switch a filter — survivors glide via{" "}
        <code>&lt;motion.li layout&gt;</code>, newcomers fade in via{" "}
        <code>initial</code> / <code>animate</code>, and items removed by a
        narrowing filter fade out via the inner{" "}
        <code>&lt;AnimatePresence mode=&quot;popLayout&quot;&gt;</code> wrapping
        the list. <code>popLayout</code> pulls exiting items from the layout
        flow immediately so survivors can reflow into the new positions while
        the removed ones fade in place.
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

      <ul className="qd-list">
        {/*
          Inner <AnimatePresence mode="popLayout"> handles per-item exit:
          a removed motion.li fades out via its `exit` prop while being
          popped out of the layout flow so the surviving items can reflow
          via their `layout` prop. Independent of the outer page-level
          <AnimatePresence> in App.tsx — nesting is fine, each tracks its
          own children.

          Duration matches list-FLIP timing in route-animations
          (LIST_FLIP_DURATION_MS = 1800ms) for visual parity across the
          three router-coordinated examples.
        */}
        <AnimatePresence mode="popLayout">
          {visible.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
              className="qd-item"
            >
              <strong>{item.label}</strong>
              <span> — {item.category}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
