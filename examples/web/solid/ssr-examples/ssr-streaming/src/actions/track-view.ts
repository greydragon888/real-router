import { onCleanup } from "solid-js";

// Solid `use:` directive — equivalent to Svelte's `use:trackView` and
// the SSR-safety story is similar. Solid's SSR runtime skips action
// invocations entirely (the function is never called during
// `renderToStream` / `renderToStringAsync`), so referencing browser-
// only APIs like `IntersectionObserver` and `window` is safe. This is
// the canonical way to add lifecycle behaviour scoped to a DOM element
// without manual `onMount` + `ref` plumbing.
//
// TypeScript integration requires module augmentation declaring the
// directive in `solid-js`'s `JSX.Directives` interface (below). Without
// it, `<div use:trackView={...}>` would error on the typechecker.
//
// **Important Solid quirk**: directives are recognised by
// `babel-preset-solid` AT COMPILE TIME via the import name. The babel
// transform sees `<x use:trackView={...}>` and emits a call to whatever
// `trackView` symbol is in scope. The function MUST therefore be
// imported in every module that uses it, even if TypeScript reports
// it as "unused" (the babel transform consumes the binding before TS
// gets to it). For this reason ProductDetail.tsx imports `trackView`
// even though it never references the symbol directly.

declare module "solid-js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface Directives {
      trackView: TrackViewParams;
    }
  }
}

export interface TrackViewParams {
  productId: string;
}

declare global {
  interface Window {
    __VIEW_LOG__?: { productId: string; ts: number }[];
  }
}

export function trackView(
  node: HTMLElement,
  params: () => TrackViewParams,
): void {
  let currentProductId = params().productId;

  const observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) {
      window.__VIEW_LOG__ = window.__VIEW_LOG__ ?? [];
      window.__VIEW_LOG__.push({
        productId: currentProductId,
        ts: Date.now(),
      });
    }
  });

  observer.observe(node);

  // Solid's `use:` directives can update via the second argument
  // (Accessor<TrackViewParams>) — track param changes here.
  // For this demo, productId is stable per render, but the pattern is
  // documented for completeness.
  const sync = (): void => {
    currentProductId = params().productId;
  };

  sync();

  onCleanup(() => {
    observer.disconnect();
  });
}
