import { TestBed } from "@angular/core/testing";
import { provideRealRouter } from "@real-router/angular";
import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { AppComponent } from "../src/app.component";
import { baseRoutes } from "../src/routes";

import type { Router } from "@real-router/core";

let testRouter: Router;

afterEach(() => {
  testRouter.stop();
});

async function setupApp() {
  testRouter = createRouter(baseRoutes, {
    defaultRoute: "home",
    allowNotFound: true,
  });
  await testRouter.start("/");

  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRealRouter(testRouter)],
  });

  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe("Feature flag toggle — analytics", () => {
  it("initial state: no Analytics link, no Admin link", async () => {
    const fixture = await setupApp();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("a[href='/analytics']")).toBeNull();
    expect(host.querySelector("a[href='/admin']")).toBeNull();
  });

  it("enabling analytics adds link in sidebar and route tree", async () => {
    const fixture = await setupApp();
    const host = fixture.nativeElement as HTMLElement;

    const analyticsToggle = host.querySelector<HTMLInputElement>(
      "#analytics-toggle",
    );
    analyticsToggle?.click();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector("a[href='/analytics']")).not.toBeNull();
    expect(host.querySelector("pre")?.textContent).toMatch(/analytics \(\/analytics\)/);
  });
});

describe("Feature flag toggle — admin with nested routes", () => {
  it("enabling admin adds parent and nested links", async () => {
    const fixture = await setupApp();
    const host = fixture.nativeElement as HTMLElement;

    const adminToggle = host.querySelector<HTMLInputElement>("#admin-toggle");
    adminToggle?.click();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector("a[href='/admin']")).not.toBeNull();
    expect(host.querySelector("a[href='/admin/users']")).not.toBeNull();
    expect(host.querySelector("a[href='/admin/settings']")).not.toBeNull();
  });
});
