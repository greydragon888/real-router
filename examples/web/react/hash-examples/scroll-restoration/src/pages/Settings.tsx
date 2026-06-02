import { BehaviorToggle } from "../components/BehaviorToggle";
import { ModeToggle } from "../components/ModeToggle";

import type { JSX } from "react";

type Mode = "restore" | "top" | "native";

interface SettingsProps {
  readonly mode: Mode;
  readonly onModeChange: (mode: Mode) => void;
  readonly behavior: ScrollBehavior;
  readonly onBehaviorChange: (behavior: ScrollBehavior) => void;
}

/**
 * Settings page — ModeToggle (Scenario 5) and BehaviorToggle (Scenario 8).
 * Both follow the same pattern: persist to localStorage + call the parent
 * setter, which updates App state → RouterProvider remounts via `key` →
 * scroll-restore utility is destroyed and recreated with new options.
 *
 * No full-document reload is used because navigation-plugin intercepts
 * `location.reload()` and converts it to a same-document SPA refresh.
 */
export function Settings({
  mode,
  onModeChange,
  behavior,
  onBehaviorChange,
}: SettingsProps): JSX.Element {
  return (
    <div className="long-page">
      <h1>Settings</h1>

      <h2>Scroll Restoration mode</h2>
      <p>
        Current: <strong>{mode}</strong>. Switching the mode remounts the
        RouterProvider — the utility is destroyed (via React effect cleanup) and
        re-created with the new mode. Mode is also persisted in{" "}
        <code>localStorage["scroll-restoration-mode"]</code> so the next cold
        load picks it up.
      </p>

      <ModeToggle mode={mode} onModeChange={onModeChange} />

      <h2>Scroll behavior</h2>
      <p>
        Current: <strong>{behavior}</strong>. Forwarded to{" "}
        <code>scrollTo({"{ behavior }"})</code> and{" "}
        <code>scrollIntoView({"{ behavior }"})</code>. <code>smooth</code> is
        best for <code>top</code> mode or anchor scroll; on <code>restore</code>{" "}
        mode the animated re-position on Back can feel disorienting.
      </p>

      <BehaviorToggle behavior={behavior} onBehaviorChange={onBehaviorChange} />

      <h2>What each mode does</h2>
      <dl>
        <dt>
          <code>restore</code> (default)
        </dt>
        <dd>
          Save on transition + pagehide; restore on back / traverse / reload.
          Forward push scrolls to anchor or top.
        </dd>
        <dt>
          <code>top</code>
        </dt>
        <dd>
          Always scroll to top (or anchor when URL has fragment) regardless of
          direction. Plugin-agnostic — works without
          <code> state.context.navigation</code>.
        </dd>
        <dt>
          <code>native</code>
        </dt>
        <dd>
          Utility is fully disabled. <code>history.scrollRestoration</code>{" "}
          stays at the browser default <code>"auto"</code> — the browser handles
          restore natively. (Note: the utility's <code>"native"</code> is the
          opposite of the DOM <code>"manual"</code> value: utility hands off to
          the browser, browser uses its built-in restore.)
        </dd>
      </dl>
    </div>
  );
}
