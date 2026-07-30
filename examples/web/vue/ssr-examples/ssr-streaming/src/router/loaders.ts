import { LoaderNotFound } from "@real-router/ssr-data-plugin/errors";

import { getProduct, listProducts } from "../database";

import type { Product } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface ProductsListData {
  products: Product[];
}

export interface ProductDetailData {
  product: Product;
}

// Vue's `<Suspense>` + `async setup()` natively integrates per-component
// data fetching: server awaits each `setup()`'s promise before emitting that
// component's chunk, then streams the rest (chunked-blocking, not OOO). This
// example pairs `ssr-data-plugin` for the critical product fetch with
// **per-component `async setup()`** for the streaming review/related
// sections, instead of `defer({ critical, deferred })`.
//
// Why not `defer()` here? Vue's `<Suspense>` resolves async setup *before*
// emitting the chunk, so the resolved value is already inline by the time
// the chunk hits the client — settle scripts (`<script>__rrDefer__(…)`)
// inside the streamed body conflict with Vue's hydration walker and
// trigger "Hydration completed but contains mismatches." Same architectural
// reason Solid uses its native `createResource` here.
//
// `defer()` shines on adapters where the framework has no native server-side
// promise integration (Preact) or where settle scripts cleanly compose with
// the framework's own splice protocol (React via `<Suspense>` + `use()`).
// See the React/Preact `ssr-streaming/` examples for the symmetric usage.
export const loaders: DataLoaderFactoryMap = {
  "products.list": () => () =>
    Promise.resolve({ products: listProducts() } satisfies ProductsListData),

  "products.detail": () => ({ params }) => {
    const id = params.id as string;
    const product = getProduct(id);

    if (!product) {
      throw new LoaderNotFound(`product:${id}`);
    }

    return Promise.resolve({ product } satisfies ProductDetailData);
  },

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  widget: { ssr: false },
};
