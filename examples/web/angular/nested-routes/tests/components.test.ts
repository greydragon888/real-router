import { TestBed } from "@angular/core/testing";
import { provideRealRouter } from "@real-router/angular";
import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { AppComponent } from "../src/app.component";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

describe("angular/nested-routes — components", () => {
  afterEach(() => {
    testRouter.stop();
  });

  async function setupApp(url: string) {
    testRouter = createRouter(routes, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    await testRouter.start(url);

    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRealRouter(testRouter)],
    });

    const fixture = TestBed.createComponent(AppComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    return fixture;
  }

  describe("Per-user sub-navigation appearance", () => {
    it("shows per-user sidebar (Profile, Settings) when on users.profile.*", async () => {
      const fixture = await setupApp("/users/1");

      const host = fixture.nativeElement as HTMLElement;
      const profileLink = host.querySelector("a[href='/users/1']");
      const settingsLink = host.querySelector("a[href='/users/1/settings']");

      expect(profileLink).not.toBeNull();
      expect(settingsLink).not.toBeNull();
    });

    it("does not show per-user sidebar on the users list page", async () => {
      const fixture = await setupApp("/users");

      const host = fixture.nativeElement as HTMLElement;

      expect(host.textContent).toMatch(/Users/);
      expect(host.querySelector("a[href='/users/1/settings']")).toBeNull();
    });

    it("does not show per-user sidebar on home page", async () => {
      const fixture = await setupApp("/");

      const host = fixture.nativeElement as HTMLElement;

      expect(host.textContent).toMatch(/Home/);
      expect(host.querySelector("a[href='/users/1']")).toBeNull();
      expect(host.querySelector("a[href='/users/1/settings']")).toBeNull();
    });
  });

  describe("Active link classes", () => {
    it("outer sidebar 'Users' has active class on users", async () => {
      const fixture = await setupApp("/users");

      const host = fixture.nativeElement as HTMLElement;
      const sidebar = host.querySelector("aside.sidebar");
      const usersLink = sidebar?.querySelector("a[href='/users']");
      const homeLink = sidebar?.querySelector("a[href='/']");

      expect(usersLink?.classList.contains("active")).toBe(true);
      expect(homeLink?.classList.contains("active")).toBe(false);
    });

    it("outer sidebar 'Users' stays active on users.profile", async () => {
      const fixture = await setupApp("/users/1");

      const host = fixture.nativeElement as HTMLElement;
      const sidebar = host.querySelector("aside.sidebar");
      const usersLink = sidebar?.querySelector("a[href='/users']");

      expect(usersLink?.classList.contains("active")).toBe(true);
    });

    it("per-user sidebar Profile link is active on /users/:id, Settings is not", async () => {
      const fixture = await setupApp("/users/1");

      const host = fixture.nativeElement as HTMLElement;
      const profileLink = host.querySelector("a[href='/users/1']");
      const settingsLink = host.querySelector("a[href='/users/1/settings']");

      expect(profileLink?.classList.contains("active")).toBe(true);
      expect(settingsLink?.classList.contains("active")).toBe(false);
    });

    it("per-user sidebar Settings link becomes active on /users/:id/settings", async () => {
      const fixture = await setupApp("/users/1/settings");

      const host = fixture.nativeElement as HTMLElement;
      const profileLink = host.querySelector("a[href='/users/1']");
      const settingsLink = host.querySelector("a[href='/users/1/settings']");

      expect(settingsLink?.classList.contains("active")).toBe(true);
      expect(profileLink?.classList.contains("active")).toBe(false);
    });
  });

  describe("Breadcrumbs", () => {
    it("shows breadcrumb trail on users", async () => {
      const fixture = await setupApp("/users");

      const host = fixture.nativeElement as HTMLElement;
      const breadcrumb = host.querySelector("nav.breadcrumbs");

      expect(breadcrumb?.textContent).toMatch(/Home/);
      expect(breadcrumb?.textContent).toMatch(/Users/);
    });

    it("shows user ID in breadcrumb on users.profile", async () => {
      const fixture = await setupApp("/users/2");

      const host = fixture.nativeElement as HTMLElement;
      const breadcrumb = host.querySelector("nav.breadcrumbs");

      expect(breadcrumb?.textContent).toMatch(/User #2/);
    });

    it("shows User #id > Settings on /users/:id/settings", async () => {
      const fixture = await setupApp("/users/3/settings");

      const host = fixture.nativeElement as HTMLElement;
      const breadcrumb = host.querySelector("nav.breadcrumbs");

      expect(breadcrumb?.textContent).toMatch(/User #3/);
      expect(breadcrumb?.textContent).toMatch(/Settings/);
    });
  });
});
