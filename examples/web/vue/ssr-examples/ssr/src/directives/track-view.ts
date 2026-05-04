// Custom Vue directive demonstrating the full lifecycle hook surface:
//   - mounted(el, binding) — runs on client mount; sets up an
//     IntersectionObserver and stores it on the element.
//   - updated(el, binding) — runs whenever the bound value changes
//     reactively; pushes the new value to a global update log so e2e
//     tests can observe the lifecycle without forcing a real
//     IntersectionObserver fire (non-trivial in headless browsers).
//   - unmounted(el) — disconnects the observer.
//
// SSR-safety: Vue calls custom directives only on the CLIENT during
// hydration / mount. The server skips them entirely, so referencing
// IntersectionObserver inside `mounted()` is safe — no need for a
// `typeof window === "undefined"` guard.
//
// Equivalent to Svelte's `use:trackView` action and Solid's
// `directive` family — Vue's syntax is a `Directive<HTMLElement, T>`
// object with named hooks instead of a function returning callbacks.

import type { Directive } from "vue";

export interface TrackViewBinding {
  productId: string;
}

declare global {
  interface Window {
    __VIEW_LOG__?: { productId: string; ts: number }[];
    __VIEW_UPDATE_LOG__?: { productId: string; ts: number }[];
  }
}

const observers = new WeakMap<HTMLElement, IntersectionObserver>();

export const trackView: Directive<HTMLElement, TrackViewBinding> = {
  mounted(el, binding) {
    let currentProductId = binding.value.productId;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.__VIEW_LOG__ = window.__VIEW_LOG__ ?? [];
            window.__VIEW_LOG__.push({
              productId: currentProductId,
              ts: Date.now(),
            });
          }
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    observers.set(el, observer);

    // Stash the productId capture target on the element so updated()
    // can rewrite it without recreating the observer.
    (el as HTMLElement & { __trackedId?: string }).__trackedId =
      currentProductId;
  },

  updated(el, binding) {
    const next = binding.value.productId;

    (el as HTMLElement & { __trackedId?: string }).__trackedId = next;

    window.__VIEW_UPDATE_LOG__ = window.__VIEW_UPDATE_LOG__ ?? [];
    window.__VIEW_UPDATE_LOG__.push({ productId: next, ts: Date.now() });
  },

  unmounted(el) {
    const observer = observers.get(el);

    if (observer) {
      observer.disconnect();
      observers.delete(el);
    }
  },
};
