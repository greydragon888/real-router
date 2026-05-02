"use client";

import type { Router } from "@real-router/core";
import { Link, RouterProvider } from "@real-router/react";
import type { ReactNode } from "react";

interface LayoutProps {
  router: Router;
  children: ReactNode;
}

export function Layout({ router, children }: LayoutProps) {
  return (
    <RouterProvider router={router}>
      <header>
        <nav>
          <Link routeName="home" data-testid="nav-home">
            Home
          </Link>
          {" | "}
          <Link routeName="users.list" data-testid="nav-users">
            Users
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </RouterProvider>
  );
}
