---
"@real-router/persistent-params-plugin": patch
---

A config bag made with `Object.create(null)` is accepted

`isValidParamsConfig` asked `getPrototypeOf(config) !== Object.prototype` to refuse a `Date`, `Map` or class instance. Written without the `=== null` arm, it refused a null-prototype bag too — so `persistentParamsPluginFactory(Object.create(null))` threw where the same content on an object literal was accepted.

```js
const config = Object.create(null);
config.lang = "en";

persistentParamsPluginFactory(config);   // threw: Invalid params configuration
persistentParamsPluginFactory({ lang: "en" });   // accepted
```

Three spellings of the shape were affected: a populated `Object.create(null)` bag, an empty one, and an ordinary literal whose prototype was demoted with `Object.setPrototypeOf`.

The predicate now tests both plain prototypes, which is the pair every other site already tests. Counted over `packages` + `shared` with tests and markdown excluded, and listed rather than counted blind: **seven other sites** ask this question through the prototype identity pair, and every one of them carries the arm — `core/engine/validation/route-batch.ts:118`, `core/helpers.ts:1002`, `validation-plugin`'s `guards/params.ts:44` and `:269` and `validators/navigation.ts:166`, and `shared/browser-env/state-guard.ts:108` and `:275`. Two further sites ask it through `proto.constructor` instead, which is a deliberately different, cross-realm-tolerant question. This file was the only drift.

**The refusal of non-plain objects is unchanged.** A `Date`, `Map`, class instance, `null` or primitive is still refused at the factory, and a non-primitive VALUE is still refused whatever the bag's prototype — before this change the prototype gate rejected such a bag before any value was read, now `isPrimitiveValue` does. Param-name rules are untouched: an invalid charset and the `__proto__` name (#1810) are still refused inside a null-prototype bag.

The canon is what decides the direction: `packages/core/CLAUDE.md` states the input contract as **"own enumerable properties only"**, and a null-prototype bag is the most conformant shape that rule admits — it carries no chain to walk at all.

Closes #2207.
