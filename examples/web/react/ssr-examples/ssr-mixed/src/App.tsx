import { UNKNOWN_ROUTE } from "@real-router/core";
import { Link, useRoute } from "@real-router/react";

import { AdminDashboard } from "./pages/Admin";
import { Doc } from "./pages/Doc";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { UserProfile } from "./pages/UserProfile";

export function App() {
  const { route } = useRoute();

  return (
    <div>
      <nav>
        <Link routeName="home">Home</Link>
        {" | "}
        <Link routeName="admin.dashboard">Admin (client-only)</Link>
        {" | "}
        <Link routeName="users.profile" routeParams={{ id: "42" }}>
          User 42 (data-only)
        </Link>
        {" | "}
        <Link routeName="docs.detail" routeParams={{ id: "guide" }}>
          Doc HTML
        </Link>
        {" | "}
        <Link
          routeName="docs.detail"
          routeParams={{ id: "guide" }}
          routeSearch={{ format: "pdf" }}
        >
          Doc PDF (client-only)
        </Link>
      </nav>
      <hr />
      {route.name === "home" && <Home />}
      {route.name === "admin.dashboard" && <AdminDashboard />}
      {route.name === "users.profile" && <UserProfile />}
      {route.name === "docs.detail" && <Doc />}
      {route.name === UNKNOWN_ROUTE && <NotFound />}
    </div>
  );
}
