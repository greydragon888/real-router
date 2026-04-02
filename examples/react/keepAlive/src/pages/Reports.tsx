import { useEffect, useRef } from "react";
import { useNavigator } from "@real-router/react";

import type { JSX } from "react";

export function Reports(): JSX.Element {
  const navigator = useNavigator();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      navigator.subscribeLeave(({ route }) => {
        if (route.name === "reports" && containerRef.current) {
          sessionStorage.setItem(
            "reports:scrollY",
            String(containerRef.current.scrollTop),
          );
        }
      }),
    [navigator],
  );

  useEffect(
    () =>
      navigator.subscribe(({ route }) => {
        if (route.name === "reports") {
          const saved = sessionStorage.getItem("reports:scrollY");
          if (saved) {
            requestAnimationFrame(() => {
              if (containerRef.current) {
                containerRef.current.scrollTop = Number(saved);
              }
            });
          }
        }
      }),
    [navigator],
  );

  return (
    <div>
      <h1>Reports</h1>
      <p>
        Scroll position preserved via <code>subscribeLeave()</code> — no
        keepAlive needed.
      </p>
      <div
        ref={containerRef}
        className="reports-scroll-container"
        style={{ height: "400px", overflowY: "auto", border: "1px solid #ddd" }}
      >
        {Array.from({ length: 50 }, (_, i) => (
          <div
            key={i}
            style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}
          >
            Report item #{i + 1} — Q{(i % 4) + 1} 2024
          </div>
        ))}
      </div>
    </div>
  );
}
