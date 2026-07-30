import type { Navigator } from "@real-router/core";
import type { JSX } from "react";

interface HashControlsProps {
  readonly navigator: Navigator;
  readonly currentHash: string;
  readonly pluginKind: "browser" | "hash";
}

/**
 * Programmatic tri-state demo. Three buttons exercise the three states of
 * `opts.hash` documented in #532:
 *
 * - **Set**: `router.navigate("settings", {}, undefined, { hash: "billing" })`
 *   — non-empty value sets the fragment.
 * - **Clear**: `router.navigate("settings", {}, undefined, { hash: "" })` —
 *   empty string explicitly clears the fragment.
 * - **Preserve**: `router.navigate("settings")` — `opts.hash` omitted; the
 *   plugin reads the current browser hash and keeps it.
 *
 * Note: the **Set** button uses `force: true, hashChange: true` so the
 * router does not reject the navigation with `SAME_STATES` when the chosen
 * hash equals the current one. `<Link hash>` does this automatically via the
 * `navigateWithHash` helper from `shared/dom-utils/link-utils.ts`; pure
 * programmatic callers are documented to opt in.
 */
export function HashControls({
  navigator,
  currentHash,
  pluginKind,
}: HashControlsProps): JSX.Element {
  return (
    <div>
      <p>
        Current <code>state.context.url.hash</code>:{" "}
        <strong data-testid="current-hash">{currentHash || "(empty)"}</strong>
      </p>
      <button
        type="button"
        data-testid="action-set-billing"
        onClick={() => {
          navigator
            .navigate("settings", {}, undefined, {
              hash: "billing",
              force: true,
              hashChange: true,
            })
            .catch(() => {});
        }}
      >
        Set hash="billing"
      </button>{" "}
      <button
        type="button"
        data-testid="action-clear"
        onClick={() => {
          navigator
            .navigate("settings", {}, undefined, {
              hash: "",
              force: true,
              hashChange: true,
            })
            .catch(() => {});
        }}
      >
        Clear hash (opts.hash="")
      </button>{" "}
      <button
        type="button"
        data-testid="action-preserve"
        onClick={() => {
          navigator.navigate("settings").catch(() => {});
        }}
      >
        Preserve (opts.hash omitted)
      </button>
      {pluginKind === "hash" ? (
        <p style={{ marginTop: "1rem", color: "#a00" }}>
          With <code>hash-plugin</code> active, the buttons emit a one-time{" "}
          <code>console.warn</code> and the fragment is silently dropped — see
          DevTools console.
        </p>
      ) : null}
    </div>
  );
}
