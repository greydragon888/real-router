import { Component, signal, effect, inject, DestroyRef } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect } from "vitest";

describe("Angular effect(onCleanup) lifecycle", () => {
  it("onCleanup fires before re-run and on destroy", async () => {
    const log: string[] = [];

    @Component({ template: "" })
    class EffectTestComponent {
      name = signal("initial");

      constructor() {
        effect((onCleanup) => {
          const current = this.name();

          log.push(`run:${current}`);

          onCleanup(() => {
            log.push(`cleanup:${current}`);
          });
        });
      }
    }

    TestBed.configureTestingModule({ imports: [EffectTestComponent] });
    const fixture = TestBed.createComponent(EffectTestComponent);

    fixture.detectChanges();

    expect(log).toContain("run:initial");

    fixture.componentInstance.name.set("updated");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(log).toContain("cleanup:initial");
    expect(log).toContain("run:updated");

    fixture.destroy();

    expect(log).toContain("cleanup:updated");
  });

  it("signal + subscribe + DestroyRef = full bridge lifecycle", () => {
    const subscriptions: string[] = [];

    @Component({ template: "" })
    class BridgeTestComponent {
      readonly value = signal(0);
      private destroyRef = inject(DestroyRef);

      constructor() {
        subscriptions.push("subscribed");

        this.destroyRef.onDestroy(() => {
          subscriptions.push("destroyed");
        });
      }
    }

    TestBed.configureTestingModule({ imports: [BridgeTestComponent] });
    const fixture = TestBed.createComponent(BridgeTestComponent);

    expect(fixture.componentInstance.value()).toBe(0);
    expect(subscriptions).toStrictEqual(["subscribed"]);

    fixture.destroy();

    expect(subscriptions).toStrictEqual(["subscribed", "destroyed"]);
  });
});
