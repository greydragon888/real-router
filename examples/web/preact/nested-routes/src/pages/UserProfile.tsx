import { Link, RouteView, useRouteNode } from "@real-router/preact";

import { UserSettings } from "./UserSettings";

import type { JSX } from "preact";

const userData: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

function ProfileDetails({ id }: { id: string }): JSX.Element {
  const user = userData[id];

  if (!user) {
    return (
      <div>
        <h2>User Not Found</h2>
        <p>No user with ID {id}.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <p>
        <strong>Role:</strong> {user.role}
      </p>
      <p>
        <strong>Email:</strong> {user.email}
      </p>
      <p>
        <strong>ID:</strong> {id}
      </p>
    </div>
  );
}

export function UserProfile(): JSX.Element {
  const { route } = useRouteNode("users.profile");
  let id = "";

  if (route) {
    id = typeof route.params.id === "string" ? route.params.id : "";
  }

  const user = id ? userData[id] : undefined;
  const displayName = user?.name ?? `User ${id || "?"}`;

  return (
    <div>
      <h1>{displayName}</h1>

      <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
        <nav style={{ minWidth: "140px" }}>
          <p
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: "8px",
            }}
          >
            {displayName}
          </p>
          <Link
            routeName="users.profile"
            routeParams={{ id }}
            activeStrict
            activeClassName="active"
            style={{
              display: "block",
              padding: "6px 12px",
              textDecoration: "none",
              color: "#555",
              borderRadius: "4px",
            }}
          >
            Profile
          </Link>
          <Link
            routeName="users.profile.settings"
            routeParams={{ id }}
            activeClassName="active"
            style={{
              display: "block",
              padding: "6px 12px",
              textDecoration: "none",
              color: "#555",
              borderRadius: "4px",
            }}
          >
            Settings
          </Link>
        </nav>

        <div style={{ flex: 1 }}>
          {/*
            `users.profile` route IS the profile-info page — no synthetic
            child for it. <RouteView.Self> renders ProfileDetails when active
            is exactly `users.profile`; the descendant `settings` Match wins
            for /users/:id/settings.
          */}
          <RouteView nodeName="users.profile">
            <RouteView.Self>
              <ProfileDetails id={id} />
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
