import { Link, useRoute, useRouter } from "@real-router/react";

import type { JSX } from "react";

const SIDEBAR_LINKS: Array<{ name: string; label: string }> = [
  { name: "home", label: "Home" },
  { name: "products", label: "Products" },
  { name: "categories", label: "Categories" },
  { name: "cart", label: "Cart" },
  { name: "checkout", label: "Checkout" },
  { name: "about", label: "About" },
];

export function VisitedBadges(): JSX.Element {
  const router = useRouter();
  // Subscribe to route changes so badges/progress re-render on navigation.
  useRoute();

  const visitedCount = SIDEBAR_LINKS.filter((link) =>
    router.hasVisited(link.name),
  ).length;
  const totalCount = SIDEBAR_LINKS.length;
  const progressPct = Math.round((visitedCount / totalCount) * 100);

  return (
    <nav aria-label="Main navigation" style={{ display: "block" }}>
      {SIDEBAR_LINKS.map((link) => {
        const visited = router.hasVisited(link.name);
        const count = router.getRouteVisitCount(link.name);

        return (
          <Link
            key={link.name}
            routeName={link.name}
            className="sidebar-link"
            activeClassName="active"
          >
            <span>{link.label}</span>
            {visited ? (
              <span className="badge badge-visited">✓ ×{count}</span>
            ) : (
              <span className="badge badge-new">NEW</span>
            )}
          </Link>
        );
      })}

      <div
        className="progress-wrapper"
        aria-label="Exploration progress"
        role="group"
      >
        <div className="progress-label">
          Explored: {visitedCount} / {totalCount} routes
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuenow={visitedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
        >
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </nav>
  );
}
