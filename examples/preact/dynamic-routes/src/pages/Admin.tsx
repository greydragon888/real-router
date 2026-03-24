import { RouteView } from "@real-router/preact";

import { AdminSettings } from "./AdminSettings";
import { AdminUsers } from "./AdminUsers";

import type { JSX } from "preact";

export function Admin(): JSX.Element {
  return (
    <div>
      <h1>Admin</h1>
      <RouteView nodeName="admin">
        <RouteView.Match segment="users">
          <AdminUsers />
        </RouteView.Match>
        <RouteView.Match segment="settings">
          <AdminSettings />
        </RouteView.Match>
        <RouteView.NotFound>
          <p>
            Use the sidebar links to navigate to Admin Users or Admin Settings.
          </p>
        </RouteView.NotFound>
      </RouteView>
    </div>
  );
}
