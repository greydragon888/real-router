import { Link, RouteView, useRouteNode } from "@real-router/solid";
import { Show } from "solid-js";

import { UserSettings } from "./UserSettings";

import type { JSX } from "solid-js";

const userData: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

function ProfileDetails(props: { id: string }): JSX.Element {
  const user = () => userData[props.id];

  return (
    <Show
      when={user()}
      fallback={
        <div>
          <h2>User Not Found</h2>
          <p>No user with ID {props.id}.</p>
        </div>
      }
    >
      {(u) => (
        <div class="card">
          <p>
            <strong>Role:</strong> {u().role}
          </p>
          <p>
            <strong>Email:</strong> {u().email}
          </p>
          <p>
            <strong>ID:</strong> {props.id}
          </p>
        </div>
      )}
    </Show>
  );
}

export function UserProfile(): JSX.Element {
  const nodeState = useRouteNode("users.profile");

  const id = () => {
    const route = nodeState().route;

    return route && typeof route.params.id === "string" ? route.params.id : "";
  };

  const user = () => (id() ? userData[id()] : undefined);

  const displayName = () => user()?.name ?? `User ${id() || "?"}`;

  return (
    <div>
      <h1>{displayName()}</h1>

      <div style={{ display: "flex", gap: "24px", "margin-top": "16px" }}>
        <nav style={{ "min-width": "140px" }}>
          <p
            style={{
              "font-size": "12px",
              "text-transform": "uppercase",
              color: "#888",
              "margin-bottom": "8px",
            }}
          >
            {displayName()}
          </p>
          <Link
            routeName="users.profile"
            routeParams={{ id: id() }}
            activeStrict
            activeClassName="active"
            style={{
              display: "block",
              padding: "6px 12px",
              "text-decoration": "none",
              color: "#555",
              "border-radius": "4px",
            }}
          >
            Profile
          </Link>
          <Link
            routeName="users.profile.settings"
            routeParams={{ id: id() }}
            activeClassName="active"
            style={{
              display: "block",
              padding: "6px 12px",
              "text-decoration": "none",
              color: "#555",
              "border-radius": "4px",
            }}
          >
            Settings
          </Link>
        </nav>

        <div style={{ flex: 1 }}>
          {/*
            `users.profile` IS the profile-info page. Self renders profile
            details; settings Match wins for /users/:id/settings.
          */}
          <RouteView nodeName="users.profile">
            <RouteView.Self>
              <ProfileDetails id={id()} />
            </RouteView.Self>
            <RouteView.Match segment="settings">
              <UserSettings />
            </RouteView.Match>
          </RouteView>
        </div>
      </div>
    </div>
  );
}
