import { Link, useRoute } from "@real-router/react";

import { HashControls } from "./HashControls";

import type { JSX } from "react";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "billing", label: "Billing" },
] as const;

const DEFAULT_TAB = "profile";

interface SettingsProps {
  readonly pluginKind: "browser" | "hash";
}

export function Settings({ pluginKind }: SettingsProps): JSX.Element {
  const { route, navigator } = useRoute();

  // Single source of truth for the active tab: `state.context.url.hash`.
  // Populated by browser-plugin / navigation-plugin on every transition;
  // hash-plugin leaves the namespace undefined.
  //
  // Both `undefined` (no URL plugin) and `""` (URL has no fragment) fall
  // back to `DEFAULT_TAB`. Explicit ternary is used instead of `||` /
  // `??` to satisfy the `prefer-nullish-coalescing` ESLint rule while
  // still treating empty string as "missing".
  const ctxHash = (route.context as { url?: { hash?: string } }).url?.hash;
  const activeTab =
    ctxHash !== undefined && ctxHash !== "" ? ctxHash : DEFAULT_TAB;

  return (
    <div>
      <h1>Settings</h1>

      <p>
        Tab state lives in the URL fragment (<code>/settings#profile</code>,{" "}
        <code>/settings#account</code>, <code>/settings#billing</code>). The
        active tab is read from <code>state.context.url.hash</code> — no scroll
        involvement, no React local state, no query params.
      </p>

      <nav role="tablist" data-testid="tabs">
        {TABS.map((tab) => (
          // `<Link hash>` is hash-aware out of the box (#532): when the prop
          // is set, isActive requires both routeName AND hash to match the
          // current state, so only the matching tab gets the default
          // `activeClassName="active"`.
          <Link
            key={tab.id}
            routeName="settings"
            hash={tab.id}
            data-testid={`tab-${tab.id}`}
            data-active={activeTab === tab.id}
            style={{ marginRight: "0.5rem" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <hr />

      <section role="tabpanel" data-testid="active-tab" data-tab={activeTab}>
        <h2>{TABS.find((tab) => tab.id === activeTab)?.label ?? "Unknown"}</h2>
        <TabContent tab={activeTab} />
      </section>

      <hr />

      <h2>Programmatic tri-state demo</h2>
      <HashControls
        navigator={navigator}
        currentHash={ctxHash ?? ""}
        pluginKind={pluginKind}
      />

      <hr />

      <h2>Cross-path preserve</h2>
      <p>
        Click{" "}
        <Link routeName="dashboard" data-testid="link-dashboard">
          Dashboard
        </Link>{" "}
        without a <code>hash</code> prop. The current fragment is preserved
        across the path change (tri-state default: <code>opts.hash</code>{" "}
        omitted ⇒ preserve current).
      </p>
    </div>
  );
}

function TabContent({ tab }: { readonly tab: string }): JSX.Element {
  switch (tab) {
    case "profile": {
      return (
        <p>
          Display name, avatar, biography. Bookmarkable via{" "}
          <code>/settings#profile</code>.
        </p>
      );
    }
    case "account": {
      return (
        <p>
          Email address, password, two-factor authentication. Bookmarkable via{" "}
          <code>/settings#account</code>.
        </p>
      );
    }
    case "billing": {
      return (
        <p>
          Subscription tier, payment method, invoice history. Bookmarkable via{" "}
          <code>/settings#billing</code>.
        </p>
      );
    }
    default: {
      return <p>Unknown tab.</p>;
    }
  }
}
