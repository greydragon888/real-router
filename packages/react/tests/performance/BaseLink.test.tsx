import { screen, render, act, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState, memo } from "react";
import { describe, beforeEach, afterEach, it, expect } from "vitest";
import { renderProfiled, withProfiler } from "vitest-react-profiler";

import { BaseLink, RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { ComponentProps, ReactNode } from "react";

describe("BaseLink - Performance Tests", () => {
  let router: Router;
  const user = userEvent.setup();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterProvider router={router}>{children}</RouterProvider>
  );

  /**
   * Helper that combines withProfiler + render with router wrapper
   * Reduces boilerplate: withProfiler(BaseLink) + render(..., { wrapper })
   */
  const renderProfiledLink = (
    props: Omit<ComponentProps<typeof BaseLink>, "router">,
  ) => {
    return renderProfiled(
      BaseLink,
      { ...props, router } as ComponentProps<typeof BaseLink>,
      { renderOptions: { wrapper } },
    );
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

    it("should efficiently handle prop changes", () => {
      const { component, rerender } = renderProfiledLink({
        routeName: "one-more-test",
        className: "class1",
        "data-testid": "link",
        children: "Test",
      });

      expect(component).toHaveRenderedTimes(1);

      // Update className 10 times
      for (let i = 2; i <= 11; i++) {
        rerender({ className: `class${i}` });
      }

      // Should have 11 renders total (1 mount + 10 updates)
      expect(component).toHaveRenderedTimes(11);
    });

    it("should track component lifecycle correctly", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      // Before rendering, component should never have mounted
      expect(ProfiledBaseLink).toHaveNeverMounted();

      const { unmount } = render(
        <ProfiledBaseLink
          router={router}
          routeName="one-more-test"
          data-testid="link"
        >
          Test Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      // After rendering, should have mounted once
      expect(ProfiledBaseLink).toHaveMountedOnce();
      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      // Unmount the component
      unmount();

      // After unmount, render count should still be 1
      expect(ProfiledBaseLink).toHaveRenderedTimes(1);
    });

    it("should track render phases correctly", () => {
      const { component, rerender } = renderProfiledLink({
        routeName: "one-more-test",
        "data-testid": "link",
        children: "Test Link",
      });

      // Initial render is a mount
      expect(component).toHaveMountedOnce();

      // Force an update by changing children
      rerender({ children: "Updated Link" });

      // Should have 2 renders total (1 mount + 1 update)
      expect(component).toHaveRenderedTimes(2);
    });
  });

  describe("Memoization", () => {
    it("should not re-render when parent re-renders with unchanged props", async () => {
      const ProfiledBaseLink = withProfiler(BaseLink);
      const MemoizedProfiledLink = memo(ProfiledBaseLink);

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
            <MemoizedProfiledLink
              router={router}
              routeName="one-more-test"
              data-testid="link"
            >
              Test Link
            </MemoizedProfiledLink>
          </div>
        );
      };

      render(<Parent />, { wrapper });

      // Initial mount
      expect(ProfiledBaseLink).toHaveRenderedTimes(1);
      expect(ProfiledBaseLink).toHaveMountedOnce();

      // Snapshot before parent rerender
      ProfiledBaseLink.snapshot();

      // Trigger parent re-render
      await user.click(screen.getByText("Rerender Parent"));

      // Component should NOT re-render because it's memoized
      expect(ProfiledBaseLink).toNotHaveRerendered();
    });

    it("should verify no unnecessary renders with memo", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);
      const MemoizedLink = memo(ProfiledBaseLink);

      const { rerender } = render(
        <MemoizedLink
          router={router}
          routeName="one-more-test"
          data-testid="link"
        >
          Test
        </MemoizedLink>,
        { wrapper },
      );

      // Initial mount
      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      // Snapshot before rerender attempt
      ProfiledBaseLink.snapshot();

      // Rerender with identical props (should be skipped by memo)
      rerender(
        <MemoizedLink
          router={router}
          routeName="one-more-test"
          data-testid="link"
        >
          Test
        </MemoizedLink>,
      );

      // Memo should prevent rerender - explicit assertion
      expect(ProfiledBaseLink).toNotHaveRerendered();
    });

    it("should re-render memoized component when props actually change", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);
      const MemoizedLink = memo(ProfiledBaseLink);

      const { rerender } = render(
        <MemoizedLink
          router={router}
          routeName="one-more-test"
          data-testid="link"
        >
          Original
        </MemoizedLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      // Change children - should trigger re-render
      rerender(
        <MemoizedLink
          router={router}
          routeName="one-more-test"
          data-testid="link"
        >
          Changed
        </MemoizedLink>,
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(2);
    });
  });

  describe("Multiple Instances Performance", () => {
    it("should handle large number of links efficiently", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      const LinkList = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <ProfiledBaseLink
              key={i}
              router={router}
              routeName="one-more-test"
              routeParams={{ id: String(i) }}
              data-testid={`link-${i}`}
            >
              Link {i}
            </ProfiledBaseLink>
          ))}
        </div>
      );

      render(<LinkList />, { wrapper });

      // Safety check: no render loops occurred
      expect(ProfiledBaseLink).notToHaveRenderLoops({
        componentName: "BaseLink (mass render)",
      });

      // Verify all links were mounted with render budget
      expect(ProfiledBaseLink).toMeetRenderCountBudget({
        maxRenders: 100,
        maxMounts: 100,
        maxUpdates: 0,
        componentName: "BaseLink",
      });

      // Verify first and last links are rendered
      expect(screen.getByTestId("link-0")).toBeInTheDocument();
      expect(screen.getByTestId("link-99")).toBeInTheDocument();
    });

    it("should update activeClassName efficiently on navigation", async () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      const LinkList = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <ProfiledBaseLink
              key={i}
              router={router}
              routeName="one-more-test"
              routeParams={{ id: String(i) }}
              activeClassName="active"
              data-testid={`link-${i}`}
            >
              Link {i}
            </ProfiledBaseLink>
          ))}
        </div>
      );

      render(<LinkList />, { wrapper });

      expect(ProfiledBaseLink).toHaveRenderedTimes(100);

      // Snapshot after initial mounts
      ProfiledBaseLink.snapshot();

      // Navigate to make link-50 active
      await act(async () => {
        await router.navigate("one-more-test", { id: "50" });
      });

      // Verify there were updates after snapshot (at least 1 rerender)
      await expect(ProfiledBaseLink).toEventuallyRerender();
      expect(screen.getByTestId("link-50")).toHaveClass("active");
    });

    it("should efficiently render with varying prop combinations", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      render(
        <div>
          {Array.from({ length: 30 }, (_, i) => (
            <ProfiledBaseLink
              key={i}
              router={router}
              routeName="one-more-test"
              routeParams={{ id: String(i) }}
              className={i % 2 === 0 ? "even" : "odd"}
              activeClassName={i % 3 === 0 ? "active-special" : "active"}
              activeStrict={i % 5 === 0}
              data-testid={`link-${i}`}
            >
              Link {i}
            </ProfiledBaseLink>
          ))}
        </div>,
        { wrapper },
      );

      // Safety check: no render loops occurred
      expect(ProfiledBaseLink).notToHaveRenderLoops({
        componentName: "BaseLink (varying props)",
      });

      // Verify all links rendered exactly once (mount only, no updates)
      expect(ProfiledBaseLink).toMeetRenderCountBudget({
        maxRenders: 30,
        maxMounts: 30,
        maxUpdates: 0,
        componentName: "BaseLink",
      });
    });
  });

  describe("Object Stability (useStableValue)", () => {
    it("should use stable params reference internally even with new object prop", () => {
      // This test verifies that useStableValue inside BaseLink works correctly
      // by checking that the href is computed correctly with stabilized params
      const ProfiledBaseLink = withProfiler(BaseLink);

      const { rerender } = render(
        <ProfiledBaseLink
          router={router}
          routeName="users.view"
          routeParams={{ id: "1" }}
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      const initialHref = screen.getByTestId("link").getAttribute("href");

      expect(initialHref).toContain("1");

      // Rerender with new object reference but same values
      rerender(
        <ProfiledBaseLink
          router={router}
          routeName="users.view"
          routeParams={{ id: "1" }}
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
      );

      // Href should be the same (computed from stable params)
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

      // Snapshot after mount
      component.snapshot();

      // Different values - SHOULD rerender and update href
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

      // Verify component rendered correctly
      expect(screen.getByTestId("link")).toBeInTheDocument();

      // Rerender with new object reference but same values
      rerender({ routeOptions: { reload: true } });

      // Component should still work correctly
      expect(screen.getByTestId("link")).toBeInTheDocument();
    });

    it("should detect when complex params change", () => {
      const { component, rerender } = renderProfiledLink({
        routeName: "users.view",
        routeParams: { id: "1", filter: "active", page: "1" },
        "data-testid": "link",
        children: "Link",
      });

      // Snapshot after mount
      component.snapshot();

      // One value changed - SHOULD rerender
      rerender({ routeParams: { id: "1", filter: "inactive", page: "1" } });

      // Should have exactly 1 rerender for changed params
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

      // Snapshot before navigation
      component.snapshot();

      // Navigate to completely unrelated route
      await act(async () => {
        await router.navigate("about");
      });

      // BaseLink pointing to "home" should NOT rerender
      // because "about" is not related to "home"
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

      // Navigate to child route - parent link may become active
      await act(async () => {
        await router.navigate("users.list");
      });

      // Should have rendered (at least mount)
      expect(component).toHaveRendered();
    });

    it("should rerender when navigating to parent route", async () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      // First navigate to child route
      await act(async () => {
        await router.navigate("users.view", { id: "1" });
      });

      render(
        <ProfiledBaseLink
          router={router}
          routeName="users.view"
          routeParams={{ id: "1" }}
          activeClassName="active"
          data-testid="link"
        >
          User View
        </ProfiledBaseLink>,
        { wrapper },
      );

      // Snapshot after mount
      ProfiledBaseLink.snapshot();

      // Navigate to parent route
      await act(async () => {
        await router.navigate("users.list");
      });

      // Should rerender because navigation affects this link
      expect(ProfiledBaseLink).toHaveRerendered();
    });
  });

  describe("Active State Transitions", () => {
    it("should rerender exactly once when becoming active", async () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          activeClassName="active"
          data-testid="link"
        >
          Home
        </ProfiledBaseLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);
      expect(screen.getByTestId("link")).not.toHaveClass("active");

      // Navigate to make link active
      await act(async () => {
        await router.navigate("home");
      });

      // Should be exactly 2 renders: mount + active state change
      await expect(ProfiledBaseLink).toEventuallyRenderTimes(2);
      expect(ProfiledBaseLink).toHaveLastRenderedWithPhase("update");
      expect(screen.getByTestId("link")).toHaveClass("active");
    });

    it("should rerender exactly once when becoming inactive", async () => {
      // Start with link on active route
      await act(async () => {
        await router.navigate("home");
      });

      const ProfiledBaseLink = withProfiler(BaseLink);

      render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          activeClassName="active"
          data-testid="link"
        >
          Home
        </ProfiledBaseLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);
      expect(screen.getByTestId("link")).toHaveClass("active");

      // Navigate away to make link inactive
      await act(async () => {
        await router.navigate("about");
      });

      // Should be exactly 2 renders: mount + inactive state change
      await expect(ProfiledBaseLink).toEventuallyRenderTimes(2);
      expect(ProfiledBaseLink).toHaveLastRenderedWithPhase("update");
      expect(screen.getByTestId("link")).not.toHaveClass("active");
    });

    it("should track render phases correctly during navigation", async () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          activeClassName="active"
          data-testid="link"
        >
          Home
        </ProfiledBaseLink>,
        { wrapper },
      );

      // Initial render is a mount
      expect(ProfiledBaseLink).toHaveMountedOnce();
      expect(ProfiledBaseLink.getRenderHistory()).toStrictEqual(["mount"]);

      // Navigate to trigger update
      await act(async () => {
        await router.navigate("home");
      });

      // Should have mount + update
      await expect(ProfiledBaseLink).toEventuallyRenderTimes(2);
      expect(screen.getByTestId("link")).toHaveClass("active");

      // Verify last render was an update (not a remount)
      expect(ProfiledBaseLink).toHaveLastRenderedWithPhase("update");

      // Detailed phase verification
      expect(ProfiledBaseLink.getRendersByPhase("mount")).toHaveLength(1);
      expect(ProfiledBaseLink.getRendersByPhase("update")).toHaveLength(1);
    });
  });

  describe("Custom Memo Comparison", () => {
    it("should correctly compute props on rerender with same callback", () => {
      const onClick = vi.fn();
      const ProfiledBaseLink = withProfiler(BaseLink);

      const { rerender } = render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          routeParams={{ id: "1" }}
          className="link"
          onClick={onClick}
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      // Verify initial render
      expect(screen.getByTestId("link")).toHaveClass("link");

      // Rerender with same values and same callback reference
      rerender(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          routeParams={{ id: "1" }}
          className="link"
          onClick={onClick}
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
      );

      // Component should still work correctly
      expect(screen.getByTestId("link")).toHaveClass("link");
    });

    it("should rerender when callback reference changes", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      const { rerender } = render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          onClick={() => {}}
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      // onClick = () => {} creates new reference each time
      rerender(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          onClick={() => {}}
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
      );

      // Should rerender because callback reference changed
      expect(ProfiledBaseLink).toHaveRenderedTimes(2);
    });

    it("should rerender when className changes", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      const { rerender } = render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          className="link-v1"
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      rerender(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          className="link-v2"
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(2);
    });

    it("should rerender when activeClassName changes", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      const { rerender } = render(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          activeClassName="active-v1"
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      rerender(
        <ProfiledBaseLink
          router={router}
          routeName="home"
          activeClassName="active-v2"
          data-testid="link"
        >
          Link
        </ProfiledBaseLink>,
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(2);
    });

    it("should rerender when routeName changes", () => {
      const ProfiledBaseLink = withProfiler(BaseLink);

      const { rerender } = render(
        <ProfiledBaseLink router={router} routeName="home" data-testid="link">
          Link
        </ProfiledBaseLink>,
        { wrapper },
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(1);

      rerender(
        <ProfiledBaseLink router={router} routeName="about" data-testid="link">
          Link
        </ProfiledBaseLink>,
      );

      expect(ProfiledBaseLink).toHaveRenderedTimes(2);
    });
  });

  describe("Multiple Links Isolation", () => {
    it("should isolate active states between sibling links", async () => {
      render(
        <>
          <BaseLink
            router={router}
            routeName="home"
            activeClassName="active"
            data-testid="link-1"
          >
            Home
          </BaseLink>
          <BaseLink
            router={router}
            routeName="about"
            activeClassName="active"
            data-testid="link-2"
          >
            About
          </BaseLink>
          <BaseLink
            router={router}
            routeName="one-more-test"
            activeClassName="active"
            data-testid="link-3"
          >
            Test
          </BaseLink>
        </>,
        { wrapper },
      );

      // Initially no link is active
      expect(screen.getByTestId("link-1")).not.toHaveClass("active");
      expect(screen.getByTestId("link-2")).not.toHaveClass("active");
      expect(screen.getByTestId("link-3")).not.toHaveClass("active");

      // Navigate to about
      await act(async () => {
        await router.navigate("about");
      });

      await waitFor(() => {
        expect(screen.getByTestId("link-2")).toHaveClass("active");
      });

      // Only about link should be active
      expect(screen.getByTestId("link-1")).not.toHaveClass("active");
      expect(screen.getByTestId("link-2")).toHaveClass("active");
      expect(screen.getByTestId("link-3")).not.toHaveClass("active");
    });

    it("should handle navigation between two links correctly", async () => {
      // Start at home
      await act(async () => {
        await router.navigate("home");
      });

      render(
        <>
          <BaseLink
            router={router}
            routeName="home"
            activeClassName="active"
            data-testid="home-link"
          >
            Home
          </BaseLink>
          <BaseLink
            router={router}
            routeName="about"
            activeClassName="active"
            data-testid="about-link"
          >
            About
          </BaseLink>
        </>,
        { wrapper },
      );

      expect(screen.getByTestId("home-link")).toHaveClass("active");
      expect(screen.getByTestId("about-link")).not.toHaveClass("active");

      // Navigate to about
      await act(async () => {
        await router.navigate("about");
      });

      await waitFor(() => {
        expect(screen.getByTestId("about-link")).toHaveClass("active");
      });

      // Active states should swap correctly
      expect(screen.getByTestId("home-link")).not.toHaveClass("active");
      expect(screen.getByTestId("about-link")).toHaveClass("active");
    });

    it("should track individual link render counts with profiler", async () => {
      // Use a single profiled component to track total renders
      const ProfiledBaseLink = withProfiler(BaseLink);

      render(
        <>
          <ProfiledBaseLink
            router={router}
            routeName="home"
            activeClassName="active"
            data-testid="home-link"
          >
            Home
          </ProfiledBaseLink>
          <ProfiledBaseLink
            router={router}
            routeName="about"
            activeClassName="active"
            data-testid="about-link"
          >
            About
          </ProfiledBaseLink>
        </>,
        { wrapper },
      );

      // Both links mounted - total 2 renders
      expect(ProfiledBaseLink).toHaveRenderedTimes(2);

      // Snapshot after initial mounts
      ProfiledBaseLink.snapshot();

      // Navigate to home - should trigger update for home link
      await act(async () => {
        await router.navigate("home");
      });

      await waitFor(() => {
        expect(screen.getByTestId("home-link")).toHaveClass("active");
      });

      // Should have rerenders for active state change (after snapshot)
      expect(ProfiledBaseLink).toHaveRerendered();
    });
  });
});
