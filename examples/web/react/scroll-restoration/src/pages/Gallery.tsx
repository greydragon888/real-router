import type { JSX } from "react";

/**
 * Scenario 6 — custom scrollContainer. The <div id="virtual-scroller"> is
 * styled overflow-y:auto + height:80vh; window does not scroll on this
 * page, only the inner div. RouterProvider's scrollContainer getter
 * returns this element when present, falls back to window otherwise
 * (lazy resolve in readPos/writePos).
 */

const cells = Array.from({ length: 200 }, (_, i) => i + 1);

export function Gallery(): JSX.Element {
  return (
    <div>
      <h1 style={{ padding: "24px 24px 0" }}>Gallery</h1>
      <p style={{ padding: "0 24px" }}>
        Scroll inside the bordered container below. Position is captured against{" "}
        <code>#virtual-scroller</code>, not <code>window</code>. Navigate away
        and back to see restore.
      </p>
      <div id="virtual-scroller" data-testid="virtual-scroller">
        <div className="gallery-grid">
          {cells.map((cellNumber) => (
            <div
              className="gallery-cell"
              key={cellNumber}
              data-testid={`gallery-cell-${cellNumber}`}
            >
              #{cellNumber}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
