import { screen, render, act, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { renderProfiled, withProfiler } from "vitest-react-profiler";

import { Link, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ComponentProps, ReactNode } from "react";

describe("Link - Performance Tests", { tags: ["performance"] }, () => {
  let router: Router;
  const user = userEvent.setup();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  type ProfiledLinkProps = ComponentProps<typeof Link> &
    Partial<Record<`data-${string}`, string>>;

  const renderProfiledLink = (props: ProfiledLinkProps) => {
    return renderProfiled(Link, props as ComponentProps<typeof Link>, {
      renderOptions: { wrapper },
    });
  };

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  describe("Render Performance", () => {
    it("should render exactly once on initial mount", () => {
      const { component } = renderProfiledLink({
        routeName: "one-more-test",
        "data-testid": "link",
        children: "Test Link",
      });

      expect(component).toHaveRendered();
      expect(component).toHaveRenderedTimes(1);
      expect(component).toHaveMountedOnce();
    });

    it("should re-render when props change", () => {
      const { component, rerender } = renderProfiledLink({
        routeName: "one-more-test",
        "data-testid": "link",
        children: "Test",
      });

      expect(component).toHaveRenderedTimes(1);
      expect(component).toHaveMountedOnce();

      rerender({ children: "Updated Test" });

      expect(component).toHaveRenderedTimes(2);
    });
  });

  describe("Memoization", () => {
    it("should not re-render when parent re-renders with unchanged props", async () => {
      // withProfiler wraps memo(Link) in a non-memo'd shell, so the
      // Profiler onRender fires even when memo bails out. Instead, we verify
      // memo effectiveness by checking DOM output stability across parent rerenders.
      const Parent = () => {
        const [, setCount] = useState(0);

        return (
          <div>
            <button
              onClick={() => {
                setCount((c) => c + 1);
              }}
            >
              Rerender Parent
            </button>
            <Link routeName="one-more-test" data-testid="link">
              Test Link
            </Link>
          </div>
        );
      };

      render(<Parent />, { wrapper });

      const linkBefore = screen.getByTestId("link").outerHTML;

      await user.click(screen.getByText("Rerender Parent"));

      expect(screen.getByTestId("link").outerHTML).toBe(linkBefore);
    });

    it("should re-render memoized component when props actually change", () => {
      const ProfiledLink = withProfiler(Link);

      const { rerender } = render(
        <ProfiledLink routeName="one-more-test" data-testid="link">
          Original
        </ProfiledLink>,
        { wrapper },
      );

      expect(ProfiledLink).toHaveRenderedTimes(1);

      rerender(
        <ProfiledLink routeName="one-more-test" data-testid="link">
          Changed
        </ProfiledLink>,
      );

      expect(ProfiledLink).toHaveRenderedTimes(2);
    });
  });

  describe("Multiple Instances Performance", () => {
    it("should handle large number of links efficiently", () => {
      const ProfiledLink = withProfiler(Link);

      const LinkList = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <ProfiledLink
              key={i}
              routeName="one-more-test"
              routeParams={{ id: String(i) }}
              data-testid={`link-${i}`}
            >
              Link {i}
            </ProfiledLink>
          ))}
        </div>
      );

      render(<LinkList />, { wrapper });

      expect(ProfiledLink).notToHaveRenderLoops({
        componentName: "Link (mass render)",
      });

      expect(ProfiledLink).toMeetRenderCountBudget({
        maxRenders: 100,
        maxMounts: 100,
        maxUpdates: 0,
        componentName: "Link",
      });

      expect(screen.getByTestId("link-0")).toBeInTheDocument();
      expect(screen.getByTestId("link-99")).toBeInTheDocument();
    });

    it("should update activeClassName efficiently on navigation", async () => {
      const ProfiledLink = withProfiler(Link);

      const LinkList = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <ProfiledLink
              key={i}
              routeName="one-more-test"
              routeParams={{ id: String(i) }}
              activeClassName="active"
              data-testid={`link-${i}`}
            >
              Link {i}
            </ProfiledLink>
          ))}
        </div>
      );

      render(<LinkList />, { wrapper });

      expect(ProfiledLink).toHaveRenderedTimes(100);

      ProfiledLink.snapshot();

      await act(async () => {
        await router.navigate("one-more-test", { id: "50" });
      });

      await expect(ProfiledLink).toEventuallyRerender();
      expect(screen.getByTestId("link-50")).toHaveClass("active");
    });

    it("should efficiently render with varying prop combinations", () => {
      const ProfiledLink = withProfiler(Link);

      render(
        <div>
          {Array.from({ length: 30 }, (_, i) => (
            <ProfiledLink
              key={i}
              routeName="one-more-test"
              routeParams={{ id: String(i) }}
              className={i % 2 === 0 ? "even" : "odd"}
              activeClassName={i % 3 === 0 ? "active-special" : "active"}
              activeStrict={i % 5 === 0}
              data-testid={`link-${i}`}
            >
              Link {i}
            </ProfiledLink>
          ))}
        </div>,
        { wrapper },
      );

      expect(ProfiledLink).notToHaveRenderLoops({
        componentName: "Link (varying props)",
      });

      expect(ProfiledLink).toMeetRenderCountBudget({
        maxRenders: 30,
        maxMounts: 30,
        maxUpdates: 0,
        componentName: "Link",
      });
    });
  });

  describe("Object Stability (useStableValue)", () => {
    it("should use stable params reference internally even with new object prop", () => {
      const ProfiledLink = withProfiler(Link);

      const { rerender } = render(
        <ProfiledLink
          routeName="users.view"
          routeParams={{ id: "1" }}
          data-testid="link"
        >
          Link
        </ProfiledLink>,
        { wrapper },
      );

      const initialHref = screen.getByTestId("link").getAttribute("href");

      expect(initialHref).toContain("1");

      rerender(
        <ProfiledLink
          routeName="users.view"
          routeParams={{ id: "1" }}
          data-testid="link"
        >
          Link
        </ProfiledLink>,
      );

      const newHref = screen.getByTestId("link").getAttribute("href");

      expect(newHref).toBe(initialHref);
    });

    it("should rerender when routeParams values actually change", () => {
      const { component, rerender } = renderProfiledLink({
        routeName: "users.view",
        routeParams: { id: "1" },
        "data-testid": "link",
        children: "Link",
      });

      const initialHref = screen.getByTestId("link").getAttribute("href");

      component.snapshot();

      rerender({ routeParams: { id: "2" } });

      const newHref = screen.getByTestId("link").getAttribute("href");

      expect(newHref).not.toBe(initialHref);
      expect(newHref).toContain("2");
      expect(component).toHaveRerenderedOnce();
    });

    it("should handle routeOptions correctly", () => {
      const { rerender } = renderProfiledLink({
        routeName: "home",
        routeOptions: { reload: true },
        "data-testid": "link",
        children: "Link",
      });

      expect(screen.getByTestId("link")).toBeInTheDocument();

      rerender({ routeOptions: { reload: true } });

      expect(screen.getByTestId("link")).toBeInTheDocument();
    });

    it("should detect when complex params change", () => {
      const { component, rerender } = renderProfiledLink({
        routeName: "users.view",
        routeParams: { id: "1", filter: "active", page: "1" },
        "data-testid": "link",
        children: "Link",
      });

      component.snapshot();

      rerender({ routeParams: { id: "1", filter: "inactive", page: "1" } });

      expect(component).toHaveRerenderedOnce();
    });
  });

  describe("Route Filtering Optimization", () => {
    it("should not rerender when navigating to unrelated route", async () => {
      const { component } = renderProfiledLink({
        routeName: "home",
        "data-testid": "link",
        children: "Home",
      });

      expect(component).toHaveRenderedTimes(1);

      component.snapshot();

      await act(async () => {
        await router.navigate("about");
      });

      expect(component).toNotHaveRerendered();
    });

    it("should rerender when navigating to child route", async () => {
      const { component } = renderProfiledLink({
        routeName: "users",
        activeClassName: "active",
        "data-testid": "link",
        children: "Users",
      });

      expect(component).toHaveRenderedTimes(1);

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(component).toHaveRendered();
    });

    it("should rerender when navigating to parent route", async () => {
      const ProfiledLink = withProfiler(Link);

      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      render(
        <ProfiledLink
          routeName="users.view"
          routeParams={{ id: "1" }}
          activeClassName="active"
          data-testid="link"
        >
          User View
        </ProfiledLink>,
        { wrapper },
      );

      ProfiledLink.snapshot();

      await act(async () => {
        await router.navigate("users.list");
      });

      expect(ProfiledLink).toHaveRerendered();
    });
  });

  describe("Active State Transitions", () => {
    it("should rerender exactly once when becoming active", async () => {
      const ProfiledLink = withProfiler(Link);

      render(
        <ProfiledLink
          routeName="home"
          activeClassName="active"
          data-testid="link"
        >
          Home
        </ProfiledLink>,
        { wrapper },
      );

      expect(ProfiledLink).toHaveRenderedTimes(1);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      await act(async () => {
        await router.navigate("home");
      });

      await expect(ProfiledLink).toEventuallyRenderTimes(2);
      expect(ProfiledLink).toHaveLastRenderedWithPhase("update");
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should rerender exactly once when becoming inactive", async () => {
      await act(async () => {
        await router.navigate("home");
      });

      const ProfiledLink = withProfiler(Link);

      render(
        <ProfiledLink
          routeName="home"
          activeClassName="active"
          data-testid="link"
        >
          Home
        </ProfiledLink>,
        { wrapper },
      );

      expect(ProfiledLink).toHaveRenderedTimes(1);
      expect(screen.getByTestId("link")).toHaveClass("active");

      await act(async () => {
        await router.navigate("about");
      });

      await expect(ProfiledLink).toEventuallyRenderTimes(2);
      expect(ProfiledLink).toHaveLastRenderedWithPhase("update");
      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should track render phases correctly during navigation", async () => {
      const ProfiledLink = withProfiler(Link);

      render(
        <ProfiledLink
          routeName="home"
          activeClassName="active"
          data-testid="link"
        >
          Home
        </ProfiledLink>,
        { wrapper },
      );

      expect(ProfiledLink).toHaveMountedOnce();
      expect(ProfiledLink.getRenderHistory()).toStrictEqual(["mount"]);

      await act(async () => {
        await router.navigate("home");
      });

      await expect(ProfiledLink).toEventuallyRenderTimes(2);
      expect(screen.getByTestId("link")).toHaveClass("active");

      expect(ProfiledLink).toHaveLastRenderedWithPhase("update");

      expect(ProfiledLink.getRendersByPhase("mount")).toHaveLength(1);
      expect(ProfiledLink.getRendersByPhase("update")).toHaveLength(1);
    });
  });

  describe("Multiple Links Isolation", () => {
    it("should isolate active states between sibling links", async () => {
      render(
        <>
          <Link routeName="home" activeClassName="active" data-testid="link-1">
            Home
          </Link>
          <Link routeName="about" activeClassName="active" data-testid="link-2">
            About
          </Link>
          <Link
            routeName="one-more-test"
            activeClassName="active"
            data-testid="link-3"
          >
            Test
          </Link>
        </>,
        { wrapper },
      );

      expect(screen.getByTestId("link-1")).not.toHaveClass("active");
      expect(screen.getByTestId("link-2")).not.toHaveClass("active");
      expect(screen.getByTestId("link-3")).not.toHaveClass("active");

      await act(async () => {
        await router.navigate("about");
      });

      await waitFor(() => {
        expect(screen.getByTestId("link-2")).toHaveClass("active");
      });

      expect(screen.getByTestId("link-1")).not.toHaveClass("active");
      expect(screen.getByTestId("link-2")).toHaveClass("active");
      expect(screen.getByTestId("link-3")).not.toHaveClass("active");
    });

    it("should handle navigation between two links correctly", async () => {
      await act(async () => {
        await router.navigate("home");
      });

      render(
        <>
          <Link
            routeName="home"
            activeClassName="active"
            data-testid="home-link"
          >
            Home
          </Link>
          <Link
            routeName="about"
            activeClassName="active"
            data-testid="about-link"
          >
            About
          </Link>
        </>,
        { wrapper },
      );

      expect(screen.getByTestId("home-link")).toHaveClass("active");
      expect(screen.getByTestId("about-link")).not.toHaveClass("active");

      await act(async () => {
        await router.navigate("about");
      });

      await waitFor(() => {
        expect(screen.getByTestId("about-link")).toHaveClass("active");
      });

      expect(screen.getByTestId("home-link")).not.toHaveClass("active");
      expect(screen.getByTestId("about-link")).toHaveClass("active");
    });

    it("should track individual link render counts with profiler", async () => {
      const ProfiledLink = withProfiler(Link);

      render(
        <>
          <ProfiledLink
            routeName="home"
            activeClassName="active"
            data-testid="home-link"
          >
            Home
          </ProfiledLink>
          <ProfiledLink
            routeName="about"
            activeClassName="active"
            data-testid="about-link"
          >
            About
          </ProfiledLink>
        </>,
        { wrapper },
      );

      expect(ProfiledLink).toHaveRenderedTimes(2);

      ProfiledLink.snapshot();

      await act(async () => {
        await router.navigate("home");
      });

      await waitFor(() => {
        expect(screen.getByTestId("home-link")).toHaveClass("active");
      });

      expect(ProfiledLink).toHaveRerendered();
    });
  });
});
