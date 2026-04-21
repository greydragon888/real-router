import { TestBed } from "@angular/core/testing";
import { provideRealRouter } from "@real-router/angular";
import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { AppComponent } from "../src/app.component";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

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

describe("Submenu appearance", () => {
  it("shows inner sidebar (List, Settings) when on users.* route", async () => {
    const fixture = await setupApp("/users/list");

    const host = fixture.nativeElement as HTMLElement;
    const listLink = host.querySelector("a[href='/users/list']");
    const settingsLink = host.querySelector("a[href='/users/settings']");

    expect(listLink).not.toBeNull();
    expect(settingsLink).not.toBeNull();
    expect(host.textContent).toMatch(/Users/);
  });

  it("does not show inner sidebar on home page", async () => {
    const fixture = await setupApp("/");

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toMatch(/Home/);
    expect(host.querySelector("a[href='/users/list']")).toBeNull();
    expect(host.querySelector("a[href='/users/settings']")).toBeNull();
  });
});

describe("Active link classes", () => {
  it("outer sidebar 'Users' has active class on users.list", async () => {
    const fixture = await setupApp("/users/list");

    const host = fixture.nativeElement as HTMLElement;
    const sidebar = host.querySelector("aside.sidebar");
    const usersLink = sidebar?.querySelector("a[href='/users']");
    const homeLink = sidebar?.querySelector("a[href='/']");

    expect(usersLink?.classList.contains("active")).toBe(true);
    expect(homeLink?.classList.contains("active")).toBe(false);
  });

  it("inner sidebar List link is active on users.list, Settings is not", async () => {
    const fixture = await setupApp("/users/list");

    const host = fixture.nativeElement as HTMLElement;
    const listLink = host.querySelector("a[href='/users/list']");
    const settingsLink = host.querySelector("a[href='/users/settings']");

    expect(listLink?.classList.contains("active")).toBe(true);
    expect(settingsLink?.classList.contains("active")).toBe(false);
  });

  it("inner sidebar Settings link becomes active on users.settings", async () => {
    const fixture = await setupApp("/users/settings");

    const host = fixture.nativeElement as HTMLElement;
    const listLink = host.querySelector("a[href='/users/list']");
    const settingsLink = host.querySelector("a[href='/users/settings']");

    expect(settingsLink?.classList.contains("active")).toBe(true);
    expect(listLink?.classList.contains("active")).toBe(false);
  });
});

describe("Breadcrumbs", () => {
  it("shows breadcrumb trail on users.list", async () => {
    const fixture = await setupApp("/users/list");

    const host = fixture.nativeElement as HTMLElement;
    const breadcrumb = host.querySelector("nav.breadcrumbs");

    expect(breadcrumb?.textContent).toMatch(/Home/);
    expect(breadcrumb?.textContent).toMatch(/Users/);
    expect(breadcrumb?.textContent).toMatch(/List/);
  });

  it("shows user ID in breadcrumb on users.profile", async () => {
    const fixture = await setupApp("/users/2");

    const host = fixture.nativeElement as HTMLElement;
    const breadcrumb = host.querySelector("nav.breadcrumbs");

    expect(breadcrumb?.textContent).toMatch(/User #2/);
  });
});
