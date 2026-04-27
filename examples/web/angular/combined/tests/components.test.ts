import { TestBed } from "@angular/core/testing";
import { provideRealRouter } from "@real-router/angular";
import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defineAbilities } from "../../../../shared/abilities";
import { store } from "../../../../shared/store";
import { AppComponent } from "../src/app.component";
import { privateRoutes, publicRoutes } from "../src/routes";

import type { AppDependencies } from "../src/types";
import type { Router } from "@real-router/core";

let testRouter: Router<AppDependencies>;

beforeEach(() => {
  store.set("user", null);
  store.set("settings:unsaved", false);
  store.set("products", null);
  store.set("products:loading", undefined);
  store.set("products:error", null);
});

afterEach(() => {
  testRouter.stop();
});

async function setupApp(url: string, asAdmin = false) {
  testRouter = createRouter<AppDependencies>(
    asAdmin ? privateRoutes : publicRoutes,
    {
      defaultRoute: "home",
      allowNotFound: true,
      queryParams: { numberFormat: "auto" },
    },
  );
  testRouter.usePlugin(lifecyclePluginFactory());

  if (asAdmin) {
    getDependenciesApi(testRouter).set("abilities", defineAbilities("admin"));
    store.set("user", { id: "1", name: "Alice", role: "admin", email: "" });
  }

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

describe("Public routes — logged out state", () => {
  it("renders Home on /", async () => {
    const fixture = await setupApp("/");
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toMatch(/Welcome to the Real-Router combined/);
    expect(host.querySelector("aside.sidebar")?.textContent).toMatch(/Home/);
    expect(host.querySelector("aside.sidebar")?.textContent).toMatch(/Login/);
    expect(host.querySelector("aside.sidebar")?.textContent).not.toMatch(
      /Dashboard/,
    );
  });

  it("renders Login on /login", async () => {
    const fixture = await setupApp("/login");
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("h1")?.textContent).toBe("Login");
  });

  it("shows 404 on unknown URL", async () => {
    const fixture = await setupApp("/unknown");
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toMatch(/404/);
  });
});

describe("Private routes — logged in state", () => {
  it("renders Dashboard on /dashboard", async () => {
    const fixture = await setupApp("/dashboard", true);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("h1")?.textContent).toBe("Dashboard");
    expect(host.textContent).toMatch(/Logged in as:/);
  });

  it("private sidebar is shown when user is set", async () => {
    const fixture = await setupApp("/dashboard", true);
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector(
      "aside.sidebar",
    );

    expect(sidebar?.textContent).toMatch(/Dashboard/);
    expect(sidebar?.textContent).toMatch(/Products/);
    expect(sidebar?.textContent).toMatch(/Users/);
    expect(sidebar?.textContent).toMatch(/Admin/);
    expect(sidebar?.textContent).not.toMatch(/Login/);
  });

  it("renders users list on /users (parent IS the list)", async () => {
    const fixture = await setupApp("/users", true);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("h1")?.textContent).toBe("Users");
    expect(host.textContent).toMatch(/Alice/);
  });

  it("renders user profile on /users/2", async () => {
    const fixture = await setupApp("/users/2", true);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("h1")?.textContent).toBe("User #2");
  });
});
