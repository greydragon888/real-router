import { useRoute, useRouter } from "@real-router/react";

import type { JSX } from "react";

export function HistoryPanel(): JSX.Element {
  const router = useRouter();
  // Subscribe to route changes so the panel re-renders on each navigation.
  useRoute();

  const visited = router.getVisitedRoutes();
  const prev = router.peekBack();
  const next = router.peekForward();
  const canBack = router.canGoBack();
  const canForward = router.canGoForward();
  const canBackToDashboard = router.canGoBackTo("dashboard");

  return (
    <aside
      className="history-panel"
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "6px",
        padding: "12px 16px",
        marginBottom: "16px",
        background: "#fafafa",
      }}
    >
      <h3 style={{ marginBottom: "8px", fontSize: "14px" }}>
        Visited routes ({visited.length})
      </h3>
      <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px" }}>
        {visited.map((name) => (
          <li key={name}>
            <code>{name}</code> × {router.getRouteVisitCount(name)}
          </li>
        ))}
      </ul>

      <p
        className="peek"
        style={{ fontSize: "13px", color: "#555", marginTop: "8px" }}
      >
        {prev ? `← previous: ${prev.name}` : "← (no previous)"}
        {"  "}
        {next ? `| next: ${next.name} →` : "| (no forward)"}
      </p>

      <div className="nav-buttons" style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          disabled={!canBack}
          onClick={() => globalThis.history.back()}
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canForward}
          onClick={() => globalThis.history.forward()}
        >
          Forward
        </button>
        <button
          type="button"
          disabled={!canBackToDashboard}
          onClick={() => {
            void router.traverseToLast("dashboard");
          }}
        >
          Jump to last Dashboard
        </button>
      </div>
    </aside>
  );
}
