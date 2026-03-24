import { useSyncExternalStore } from "preact/compat";

import { errorStore } from "../error-store";

import type { JSX } from "preact";

export function ErrorPanel(): JSX.Element {
  const errors = useSyncExternalStore(errorStore.subscribe, errorStore.getAll);

  return (
    <div className="card" style={{ marginTop: "24px" }}>
      <strong>onTransitionError plugin log</strong>
      {errors.length === 0 ? (
        <p style={{ color: "#888", marginTop: "8px", fontSize: "13px" }}>
          No errors yet — click the buttons above to trigger navigation errors.
        </p>
      ) : (
        <ul style={{ paddingLeft: "16px", marginTop: "8px" }}>
          {errors.toReversed().map((entry, i) => (
            <li key={i} style={{ marginBottom: "4px", fontSize: "13px" }}>
              <strong style={{ color: "#c62828" }}>{entry.code}</strong>
              {entry.path ? ` — path: ${entry.path}` : ""}
              <span style={{ color: "#888", marginLeft: "8px" }}>
                {new Date(entry.time).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
