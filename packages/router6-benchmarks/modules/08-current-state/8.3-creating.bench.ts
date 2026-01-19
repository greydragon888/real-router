// packages/real-router-benchmarks/modules/08-current-state/8.3-creating.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

// 8.3.1 Batch creating 1000 basic states
{
  const router = createSimpleRouter();

  bench("8.3.1 Batch creating 1000 basic states", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.makeState("about", {}, "/about"));
    }
  }).gc("inner");
}

// 8.3.2 Batch creating 1000 states with parameters
{
  const router = createSimpleRouter();

  bench("8.3.2 Batch creating 1000 states with parameters", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(
        router.makeState("user", { id: String(i) }, `/users/${i}`),
      );
    }
  }).gc("inner");
}

// 8.3.3 Batch creating 1000 states with meta
{
  const router = createSimpleRouter();

  bench("8.3.3 Batch creating 1000 states with meta", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(
        router.makeState("about", {}, "/about", {
          params: {},
          options: { reload: true },
          redirected: false,
        }),
      );
    }
  }).gc("inner");
}

// 8.3.4 Batch creating 1000 states with forceId
{
  const router = createSimpleRouter();

  bench("8.3.4 Batch creating 1000 states with forceId", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.makeState("about", {}, "/about", undefined, i));
    }
  }).gc("inner");
}

// 8.3.5 Batch creating 1000 not found states
{
  const router = createSimpleRouter();

  bench("8.3.5 Batch creating 1000 not found states", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.makeNotFoundState("/nonexistent"));
    }
  }).gc("inner");
}
