import { bench, boxplot, do_not_optimize, run, summary } from "mitata";

import { KeyIndexCache, CacheManager } from "../../src/index";

// --- Section 1: KeyIndexCache — get() performance ---

boxplot(() => {
  summary(() => {
    // Cache hit: same key repeated (best case)
    {
      const cache = new KeyIndexCache<number>(100);

      cache.get("warmKey", () => 42);

      bench("KIC get() hit — same key repeated", () => {
        do_not_optimize(cache.get("warmKey", () => 42));
      }).gc("inner");
    }

    // Cache hit: cycling 10 keys (realistic pattern)
    {
      const cache = new KeyIndexCache<number>(100);
      const keys = Array.from({ length: 10 }, (_, i) => `key${i}`);

      for (const key of keys) {
        cache.get(key, () => 1);
      }

      let index = 0;

      bench("KIC get() hit — cycling 10 keys", () => {
        const key = keys[index++ % 10];

        do_not_optimize(cache.get(key, () => 1));
      }).gc("inner");
    }

    // Cache miss: unique keys (always computes)
    {
      const cache = new KeyIndexCache<number>(100_000);
      const keys = Array.from({ length: 10_000 }, (_, i) => `miss${i}`);
      let index = 0;

      bench("KIC get() miss — unique keys", () => {
        const key = keys[index++ % keys.length];

        do_not_optimize(cache.get(key, () => index));
      }).gc("inner");
    }

    // Cache miss with eviction: maxSize=100, unique keys force LRU eviction
    {
      const cache = new KeyIndexCache<number>(100);
      const keys = Array.from({ length: 10_000 }, (_, i) => `evict${i}`);
      let index = 0;

      bench("KIC get() miss + eviction (maxSize=100)", () => {
        const key = keys[index++ % keys.length];

        do_not_optimize(cache.get(key, () => index));
      }).gc("inner");
    }
  });
});

// Compute cost comparison
boxplot(() => {
  summary(() => {
    {
      const cache = new KeyIndexCache<number>(100);

      bench("KIC get() miss — cheap compute (() => 1)", () => {
        cache.clear();
        do_not_optimize(cache.get("k", () => 1));
      }).gc("inner");
    }

    {
      const cache = new KeyIndexCache<string>(100);

      bench("KIC get() miss — expensive compute (array join)", () => {
        cache.clear();
        do_not_optimize(
          cache.get("k", () =>
            Array.from({ length: 50 }, (_, i) => `s${i}`).join("."),
          ),
        );
      }).gc("inner");
    }
  });
});

// --- Section 2: KeyIndexCache — mutation operations ---

boxplot(() => {
  summary(() => {
    // invalidateMatching: 10% match
    {
      const cache = new KeyIndexCache<number>(1000);

      for (let i = 0; i < 1000; i++) {
        cache.get(`route${i}`, () => i);
      }

      bench("KIC invalidateMatching — 10% match (100/1000)", () => {
        cache.invalidateMatching((key) => key.startsWith("route9"));
        // Refill evicted entries for next iteration
        for (let i = 900; i < 1000; i++) {
          cache.get(`route${i}`, () => i);
        }
      }).gc("inner");
    }

    // invalidateMatching: 50% match
    {
      const cache = new KeyIndexCache<number>(1000);

      for (let i = 0; i < 1000; i++) {
        cache.get(`${i < 500 ? "a" : "b"}.route${i}`, () => i);
      }

      bench("KIC invalidateMatching — 50% match (500/1000)", () => {
        cache.invalidateMatching((key) => key.startsWith("a."));
        // Refill evicted entries
        for (let i = 0; i < 500; i++) {
          cache.get(`a.route${i}`, () => i);
        }
      }).gc("inner");
    }

    // invalidateMatching: 100% match
    {
      const cache = new KeyIndexCache<number>(1000);

      for (let i = 0; i < 1000; i++) {
        cache.get(`route${i}`, () => i);
      }

      bench("KIC invalidateMatching — 100% match (1000/1000)", () => {
        cache.invalidateMatching(() => true);
        // Refill all entries
        for (let i = 0; i < 1000; i++) {
          cache.get(`route${i}`, () => i);
        }
      }).gc("inner");
    }
  });
});

// clear benchmarks
boxplot(() => {
  summary(() => {
    {
      const cache = new KeyIndexCache<number>(100);

      for (let i = 0; i < 50; i++) {
        cache.get(`key${i}`, () => i);
      }

      bench("KIC clear — small cache (50 entries)", () => {
        cache.clear();
        // Refill for next iteration
        for (let i = 0; i < 50; i++) {
          cache.get(`key${i}`, () => i);
        }
      }).gc("inner");
    }

    {
      const cache = new KeyIndexCache<number>(5000);

      for (let i = 0; i < 5000; i++) {
        cache.get(`key${i}`, () => i);
      }

      bench("KIC clear — large cache (5000 entries)", () => {
        cache.clear();
        // Refill for next iteration
        for (let i = 0; i < 5000; i++) {
          cache.get(`key${i}`, () => i);
        }
      }).gc("inner");
    }
  });
});

// --- Section 3: CacheManager — registry operations ---

boxplot(() => {
  summary(() => {
    // register + unregister (fallback pattern)
    {
      const manager = new CacheManager();

      bench("CM register + unregister", () => {
        manager.register("bench", { maxSize: 100 });
        manager.unregister("bench");
      }).gc("inner");
    }

    // invalidateForNewRoutes: 1 cache
    {
      const manager = new CacheManager();
      const cache = manager.register<number>("path", {
        maxSize: 500,
        onInvalidate: (c, names) => {
          c.invalidateMatching((key) => names.some((n) => key.includes(n)));
        },
      });

      for (let i = 0; i < 200; i++) {
        cache.get(`users.route${i}`, () => i);
      }

      const newRoutes = ["users.settings", "users.profile"];

      bench("CM invalidateForNewRoutes — 1 cache", () => {
        manager.invalidateForNewRoutes(newRoutes);
      }).gc("inner");
    }

    // invalidateForNewRoutes: 5 caches
    {
      const manager = new CacheManager();

      for (let i = 0; i < 5; i++) {
        const cache = manager.register<number>(`cache${i}`, {
          maxSize: 200,
          onInvalidate: (c, names) => {
            c.invalidateMatching((key) => names.some((n) => key.includes(n)));
          },
        });

        for (let j = 0; j < 100; j++) {
          cache.get(`route${j}`, () => j);
        }
      }

      const newRoutes = ["route50", "route75"];

      bench("CM invalidateForNewRoutes — 5 caches", () => {
        manager.invalidateForNewRoutes(newRoutes);
      }).gc("inner");
    }

    // clear: 1 cache
    {
      const manager = new CacheManager();
      const cache = manager.register<number>("single", { maxSize: 500 });

      for (let i = 0; i < 200; i++) {
        cache.get(`key${i}`, () => i);
      }

      bench("CM clear — 1 cache", () => {
        manager.clear();
        // Refill for next iteration
        for (let i = 0; i < 200; i++) {
          cache.get(`key${i}`, () => i);
        }
      }).gc("inner");
    }

    // clear: 5 caches
    {
      const manager = new CacheManager();
      const caches: KeyIndexCache<number>[] = [];

      for (let i = 0; i < 5; i++) {
        const cache = manager.register<number>(`c${i}`, { maxSize: 200 });

        for (let j = 0; j < 100; j++) {
          cache.get(`key${j}`, () => j);
        }

        caches.push(cache);
      }

      bench("CM clear — 5 caches", () => {
        manager.clear();
        // Refill for next iteration
        for (const cache of caches) {
          for (let j = 0; j < 100; j++) {
            cache.get(`key${j}`, () => j);
          }
        }
      }).gc("inner");
    }

    // getMetrics: 1 cache
    {
      const manager = new CacheManager();
      const cache = manager.register<number>("metrics1", { maxSize: 500 });

      for (let i = 0; i < 100; i++) {
        cache.get(`key${i}`, () => i);
      }

      bench("CM getMetrics — 1 cache", () => {
        do_not_optimize(manager.getMetrics());
      }).gc("inner");
    }

    // getMetrics: 5 caches
    {
      const manager = new CacheManager();

      for (let i = 0; i < 5; i++) {
        const cache = manager.register<number>(`m${i}`, { maxSize: 200 });

        for (let j = 0; j < 100; j++) {
          cache.get(`key${j}`, () => j);
        }
      }

      bench("CM getMetrics — 5 caches", () => {
        do_not_optimize(manager.getMetrics());
      }).gc("inner");
    }
  });
});

// --- Section 4: Stress tests ---

// 100K sustained cache hits
{
  const cache = new KeyIndexCache<number>(500);
  const keys = Array.from({ length: 500 }, (_, i) => `warm${i}`);

  for (const key of keys) {
    cache.get(key, () => 1);
  }

  bench("Stress: 100K cache hits on warm cache (500 entries)", () => {
    for (let i = 0; i < 100_000; i++) {
      cache.get(keys[i % 500], () => 1);
    }
  }).gc("inner");
}

// 100K unique keys with maxSize=100 (cache thrashing / eviction storm)
{
  const cache = new KeyIndexCache<number>(100);

  bench("Stress: 100K unique keys, maxSize=100 (99.9% eviction)", () => {
    for (let i = 0; i < 100_000; i++) {
      cache.get(`thrash${i}`, () => i);
    }

    cache.clear();
  }).gc("inner");
}

// 100K mixed workload: 70% hits, 30% misses
{
  const cache = new KeyIndexCache<number>(1000);
  const hitKeys = Array.from({ length: 700 }, (_, i) => `hit${i}`);
  const missKeys = Array.from({ length: 10_000 }, (_, i) => `miss${i}`);

  for (const key of hitKeys) {
    cache.get(key, () => 1);
  }

  let missIndex = 0;

  bench("Stress: 100K mixed workload (70% hit, 30% miss)", () => {
    for (let i = 0; i < 100_000; i++) {
      if (i % 10 < 7) {
        cache.get(hitKeys[i % 700], () => 1);
      } else {
        cache.get(missKeys[missIndex++ % 10_000], () => i);
      }
    }
  }).gc("inner");
}

// Rapid register/dispose cycles (GC pressure)
{
  bench("Stress: 1000 register/dispose cycles (GC pressure)", () => {
    for (let i = 0; i < 1000; i++) {
      const manager = new CacheManager();

      for (let j = 0; j < 5; j++) {
        const cache = manager.register<number>(`c${j}`, { maxSize: 50 });

        for (let k = 0; k < 50; k++) {
          cache.get(`key${k}`, () => k);
        }
      }

      manager.dispose();
    }
  }).gc("inner");
}

// --- Section 5: Memory benchmarks (manual, after mitata) ---

const gc = globalThis.gc;

async function measureMemory(
  _label: string,
  fn: () => void,
  iterations: number,
): Promise<{ heapDelta: number; timeMs: number }> {
  // Warm up
  for (let i = 0; i < 100; i++) {
    fn();
  }

  if (gc) {
    gc();
  }

  await new Promise((resolve) => setTimeout(resolve, 50));

  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = performance.now();

  if (gc) {
    gc();
  }

  const heapAfter = process.memoryUsage().heapUsed;

  return {
    heapDelta: heapAfter - heapBefore,
    timeMs: end - start,
  };
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);

  if (abs < 1024) {
    return `${bytes} B`;
  }
  if (abs < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const memoryTests = async () => {
  console.log(`\n${"=".repeat(70)}`);
  console.log("  MEMORY BENCHMARKS");
  console.log("=".repeat(70));

  const tests = [
    {
      name: "100K hits on warm cache (500)",
      fn: (() => {
        const cache = new KeyIndexCache<number>(500);
        const keys = Array.from({ length: 500 }, (_, i) => `warm${i}`);

        for (const key of keys) {
          cache.get(key, () => 1);
        }

        return () => {
          for (let i = 0; i < 100; i++) {
            cache.get(keys[i % 500], () => 1);
          }
        };
      })(),
      iterations: 1000,
    },
    {
      name: "100K evictions (maxSize=100)",
      fn: (() => {
        const cache = new KeyIndexCache<number>(100);
        let counter = 0;

        return () => {
          for (let i = 0; i < 100; i++) {
            cache.get(`ev${counter++}`, () => counter);
          }
        };
      })(),
      iterations: 1000,
    },
    {
      name: "Sustained invalidation cycles",
      fn: (() => {
        const manager = new CacheManager();
        const cache = manager.register<number>("inv", {
          maxSize: 500,
          onInvalidate: (c, names) => {
            c.invalidateMatching((key) => names.some((n) => key.includes(n)));
          },
        });

        return () => {
          for (let i = 0; i < 100; i++) {
            cache.get(`route${i}`, () => i);
          }

          manager.invalidateForNewRoutes(["route5", "route10"]);
        };
      })(),
      iterations: 1000,
    },
    {
      name: "GC pressure: register/dispose",
      fn: () => {
        const manager = new CacheManager();

        for (let j = 0; j < 3; j++) {
          const cache = manager.register<number>(`c${j}`, { maxSize: 20 });

          for (let k = 0; k < 20; k++) {
            cache.get(`k${k}`, () => k);
          }
        }

        manager.dispose();
      },
      iterations: 10_000,
    },
  ];

  console.log(
    `\n${"Test".padEnd(40)}${"Heap Δ".padStart(12)}${"Time".padStart(12)}${"Ops/s".padStart(14)}`,
  );
  console.log("-".repeat(78));

  for (const test of tests) {
    if (gc) {
      gc();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await measureMemory(test.name, test.fn, test.iterations);
    const opsPerSec = Math.round(test.iterations / (result.timeMs / 1000));

    console.log(
      test.name.padEnd(40) +
        formatBytes(result.heapDelta).padStart(12) +
        `${result.timeMs.toFixed(2)}ms`.padStart(12) +
        `${(opsPerSec / 1000).toFixed(0)}K`.padStart(14),
    );
  }

  console.log(`\n${"=".repeat(70)}`);
};

void run().then(() => memoryTests());
