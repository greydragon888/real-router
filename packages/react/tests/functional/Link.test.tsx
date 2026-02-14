import { render, screen } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/react";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

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

  it("should have active class if associated route is active", async () => {
    await router.start("/home");

    render(
      <RouterProvider router={router}>
        <Link routeName={"home"}>{TEST_TEXT}</Link>
      </RouterProvider>,
    );

    const linkElement = screen.queryByText(TEST_TEXT)!;

    expect(linkElement).toHaveClass("active");
  });

  it("should have active class if default route is active", async () => {
    router = createTestRouter();
    router.addRoute({ name: "home", path: "/home" });
    await router.start("/home");

    render(
      <RouterProvider router={router}>
        <Link routeName={"home"}>{TEST_TEXT}</Link>
      </RouterProvider>,
    );

    const linkElement = screen.queryByText(TEST_TEXT)!;

    expect(linkElement).toHaveClass("active");
  });
});
