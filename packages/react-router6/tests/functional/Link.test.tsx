import { render, screen } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterProvider } from "react-router6";

import { createTestRouter } from "../helpers";

import type { Router } from "router6";

let router: Router;
const TEST_TEXT = "Test text";

describe("Link component", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.addRoute({
      name: "home",
      path: "/home",
    });
  });

  afterEach(() => {
    router.stop();
  });

  it("should render an hyperlink element", () => {
    render(
      <RouterProvider router={router}>
        <Link routeName={"home"}>{TEST_TEXT}</Link>
      </RouterProvider>,
    );

    const linkElement = screen.queryByText(TEST_TEXT)!;

    expect(linkElement.getAttribute("href")).toStrictEqual("/home");
    expect(linkElement).not.toHaveClass("active");
  });

  it("should have active class if associated route is active", () => {
    router.start("/home");

    render(
      <RouterProvider router={router}>
        <Link routeName={"home"}>{TEST_TEXT}</Link>
      </RouterProvider>,
    );

    const linkElement = screen.queryByText(TEST_TEXT)!;

    expect(linkElement).toHaveClass("active");
  });

  it("should have active class if default route is active", () => {
    router.setOption("defaultRoute", "home");
    router.start();

    render(
      <RouterProvider router={router}>
        <Link routeName={"home"}>{TEST_TEXT}</Link>
      </RouterProvider>,
    );

    const linkElement = screen.queryByText(TEST_TEXT)!;

    expect(linkElement).toHaveClass("active");
  });
});
