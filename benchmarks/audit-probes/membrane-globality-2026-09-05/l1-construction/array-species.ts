// L1-construction · the ROUTES ARRAY and each CHILDREN ARRAY are caller-built
// containers too. `snapshotRouteBatch` copies them with `routes.map(...)`, and
// `Array.prototype.map` performs ArraySpeciesCreate — it asks the caller's array
// for `constructor[Symbol.species]` and builds the copy WITH THAT constructor.
// So for an Array subclass the "copy" is an instance of the caller's class.
//
// Measured here: how many times construction consults the species getter, and
// whether the objects core builds from the copy are instances of the subclass.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { show } from "./census";

let speciesReads = 0;
let constructed = 0;

class AppArray<T> extends Array<T> {
  static override get [Symbol.species](): ArrayConstructor {
    speciesReads += 1;

    return AppArray as unknown as ArrayConstructor;
  }

  constructor(...args: unknown[]) {
    super(...(args as never[]));
    constructed += 1;
  }
}

const children = AppArray.from([{ name: "kid", path: "/kid" }]) as AppArray<unknown>;
const routes = AppArray.from([
  { name: "u", path: "/u/:id", children },
  { name: "home", path: "/home" },
]) as AppArray<unknown>;

speciesReads = 0;
constructed = 0;

const router = createRouter(routes as never);

show("species getter reads during createRouter:", speciesReads);
show("AppArray constructor invocations during createRouter (copies built with the CALLER's class):", constructed);
show("control · routes registered (buildPath u.kid):", router.buildPath("u.kid", { id: "1" }));
show("getRoutesApi().get('u').children instanceof AppArray (derived from the frozen tree, not the snapshot):",
  getRoutesApi(router).get("u")?.children instanceof AppArray);
router.dispose();

// Control: a plain array consults `constructor` too, but Array's species is Array.
const plain = [{ name: "p", path: "/p" }];
const before = speciesReads;

createRouter(plain as never).dispose();
show("control · plain array: species reads on AppArray during a plain-array construction:", speciesReads - before);
