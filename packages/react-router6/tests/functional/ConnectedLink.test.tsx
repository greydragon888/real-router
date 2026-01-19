import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { ConnectedLink, RouterProvider } from "react-router6";

import { createTestRouter } from "../helpers";

import type { Router } from "router6";

let router: Router;
const TEST_TEXT = "Test text";
const user = userEvent.setup();

describe("ConnectedLink component", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.addRoute({
      name: "home",
      path: "/home",
    });
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  it('should not call router’s navigate method when used with target="_blank"', async () => {
    render(
      <RouterProvider router={router}>
        <ConnectedLink routeName="home" title="Hello" target="_blank">
          {TEST_TEXT}
        </ConnectedLink>
      </RouterProvider>,
    );
    const a = screen.queryByText(TEST_TEXT)!;
    const navSpy = vi.spyOn(router, "navigate");

    await user.click(a);

    expect(a.getAttribute("target")).not.toStrictEqual(undefined);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it("should spread other props to its link", () => {
    render(
      <RouterProvider router={router}>
        <ConnectedLink
          routeName="home"
          title="Hello"
          data-testid="Link"
          className="custom-class"
        >
          {TEST_TEXT}
        </ConnectedLink>
      </RouterProvider>,
    );

    const a = screen.queryByText(TEST_TEXT)!;

    expect(a.getAttribute("title")).toStrictEqual("Hello");
    expect(a.dataset.testid).toStrictEqual("Link");
    expect(a.getAttribute("href")).toStrictEqual("/home");
    expect(a.className).toContain("custom-class");
  });
  // add test for the state packages/real-router-plugin-browser/modules/browser.ts:87
});
