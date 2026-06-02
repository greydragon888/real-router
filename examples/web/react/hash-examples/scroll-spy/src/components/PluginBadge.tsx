import type { JSX } from "react";

interface PluginBadgeProps {
  readonly pluginKind: "browser" | "navigation";
}

export function PluginBadge({ pluginKind }: PluginBadgeProps): JSX.Element {
  return (
    <span className="plugin-badge" data-testid="plugin-badge">
      plugin: {pluginKind}
    </span>
  );
}
