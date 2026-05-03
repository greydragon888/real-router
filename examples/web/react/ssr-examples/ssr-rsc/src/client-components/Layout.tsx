"use client";

import { Link, RouterProvider } from "@real-router/react";

import type { Router } from "@real-router/core";
import type { ReactElement, ReactNode } from "react";

interface LayoutProps {
  readonly router: Router;
  readonly children: ReactNode;
}

export function Layout({ router, children }: LayoutProps): ReactElement {
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
