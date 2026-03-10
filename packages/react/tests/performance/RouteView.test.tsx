import { render, screen, act } from "@testing-library/react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { FC } from "react";

describe("RouteView - Performance Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  function createTestPage(testId: string, renderCount: { value: number }): FC {
    return () => {
      renderCount.value++;

      return <div data-testid={testId}>{testId}</div>;
    };
  }

  describe("Sibling isolation", () => {
    it("should not re-render sibling components when Match changes", async () => {
      await router.start("/users/list");

      let siblingRenders = 0;

      const Sibling: FC = () => {
        siblingRenders++;

        return <div data-testid="sibling">Sibling</div>;
      };

      render(
        <RouterProvider router={router}>
          <Sibling />
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      // eslint-disable-next-line testing-library/render-result-naming-convention
      const siblingRendersAfterMount = siblingRenders;

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(screen.getByTestId("view")).toBeInTheDocument();
      expect(siblingRenders).toBe(siblingRendersAfterMount);
    });
  });

  describe("Match children", () => {
    it("should only render the matched child, not all Match children", async () => {
      await router.start("/users/list");

      let listRenders = 0;
      let viewRenders = 0;
      let editRenders = 0;

      const ListPage: FC = () => {
        listRenders++;

        return <div data-testid="list">List</div>;
      };

      const ViewPage: FC = () => {
        viewRenders++;

        return <div data-testid="view">View</div>;
      };

      const EditPage: FC = () => {
        editRenders++;

        return <div data-testid="edit">Edit</div>;
      };

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list">
              <ListPage />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <ViewPage />
            </RouteView.Match>
            <RouteView.Match segment="edit">
              <EditPage />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(listRenders).toBeGreaterThan(0);
      expect(viewRenders).toBe(0);
      expect(editRenders).toBe(0);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(viewRenders).toBeGreaterThan(0);
      expect(editRenders).toBe(0);
    });
  });

  describe("keepAlive - Lazy activation", () => {
    it("should not render keepAlive children that were never navigated to", async () => {
      await router.start("/users/list");

      const listCount = { value: 0 };
      const viewCount = { value: 0 };
      const editCount = { value: 0 };
      const ListPage = createTestPage("list", listCount);
      const ViewPage = createTestPage("view", viewCount);
      const EditPage = createTestPage("edit", editCount);

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <ListPage />
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <ViewPage />
            </RouteView.Match>
            <RouteView.Match segment="edit" keepAlive>
              <EditPage />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      expect(listCount.value).toBeGreaterThan(0);
      expect(viewCount.value).toBe(0);
      expect(editCount.value).toBe(0);
    });

    it("should activate keepAlive child only on first navigation to it", async () => {
      await router.start("/users/list");

      const viewCount = { value: 0 };
      const editCount = { value: 0 };
      const ViewPage = createTestPage("view", viewCount);
      const EditPage = createTestPage("edit", editCount);

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <ViewPage />
            </RouteView.Match>
            <RouteView.Match segment="edit" keepAlive>
              <EditPage />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      expect(viewCount.value).toBeGreaterThan(0);
      expect(editCount.value).toBe(0);
    });
  });

  describe("keepAlive - Mixed rendering", () => {
    it("should not render non-keepAlive Match when only keepAlive matches are navigated", async () => {
      await router.start("/users/list");

      const editCount = { value: 0 };
      const EditPage = createTestPage("edit", editCount);

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <div data-testid="list">List</div>
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <div data-testid="view">View</div>
            </RouteView.Match>
            <RouteView.Match segment="edit">
              <EditPage />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(editCount.value).toBe(0);
    });
  });

  describe("keepAlive - Navigation cycle budget", () => {
    it("should meet render budget for visible-hidden-visible cycle", async () => {
      await router.start("/users/list");

      const listCount = { value: 0 };
      const ListPage = createTestPage("list", listCount);

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <ListPage />
            </RouteView.Match>
            <RouteView.Match segment="view">
              <div data-testid="view">View</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      const listRendersAfterMount = listCount.value;

      // Cycle: list(visible) → view(list hidden) → list(visible again)
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.list");
      });

      // Budget: at most 2 additional renders per hide/show cycle
      const additionalRenders = listCount.value - listRendersAfterMount;

      expect(additionalRenders).toBeLessThanOrEqual(2);
    });

    it("should meet render budget with multiple keepAlive matches over several navigations", async () => {
      await router.start("/users/list");

      const listCount = { value: 0 };
      const viewCount = { value: 0 };
      const editCount = { value: 0 };
      const ListPage = createTestPage("list", listCount);
      const ViewPage = createTestPage("view", viewCount);
      const EditPage = createTestPage("edit", editCount);

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <ListPage />
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <ViewPage />
            </RouteView.Match>
            <RouteView.Match segment="edit" keepAlive>
              <EditPage />
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      const listAfterMount = listCount.value;

      // Navigate: list → view → edit → list → view
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      await act(async () => {
        await router.navigate("users.list");
      });

      await act(async () => {
        await router.navigate("users.view", { id: "2" });
      });

      expect(listCount.value).toBeGreaterThan(0);
      expect(viewCount.value).toBeGreaterThan(0);
      expect(editCount.value).toBeGreaterThan(0);

      // Budget: list had mount + at most 4 additional renders
      // (one per navigation that changes its visibility)
      const listAdditional = listCount.value - listAfterMount;

      expect(listAdditional).toBeLessThanOrEqual(4);
    });
  });

  describe("keepAlive - Hidden children isolation", () => {
    it("hidden keepAlive children should not re-render on sibling navigation", async () => {
      await router.start("/users/list");

      const listCount = { value: 0 };
      const ListPage = createTestPage("list", listCount);

      render(
        <RouterProvider router={router}>
          <RouteView nodeName="users">
            <RouteView.Match segment="list" keepAlive>
              <ListPage />
            </RouteView.Match>
            <RouteView.Match segment="view" keepAlive>
              <div data-testid="view">View</div>
            </RouteView.Match>
            <RouteView.Match segment="edit" keepAlive>
              <div data-testid="edit">Edit</div>
            </RouteView.Match>
          </RouteView>
        </RouterProvider>,
      );

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      const listRendersAfterHidden = listCount.value;

      await act(async () => {
        await router.navigate("users.edit", { id: "1" });
      });

      expect(listCount.value).toBe(listRendersAfterHidden);
    });
  });
});
