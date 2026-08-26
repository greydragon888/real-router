---
"@real-router/navigation-plugin": patch
---

An option key that is not an option is skipped, whatever it is called (#1838)

`validateOptions` (`shared/browser-env/validation.ts`, shared by all three URL
plugins) asked `key in defaults`, and `defaults` is a plain object literal — so
the walk reached `Object.prototype` and answered for every one of its own
members, which were then type-checked against the inherited method it found.

Measured through the public factory before the fix, all twelve threw:

```
nonsenseKey  accepted (skipped as unknown)   ← the intended behaviour
toString     THROWS  Invalid type for 'toString': expected function, got string
__proto__    THROWS  Invalid type for '__proto__': expected object, got string
```

The asymmetry was the defect: a typo'd option was forgiven, and a typo that
happened to collide with a prototype member was a hard error about a type the
caller never declared. It is `Object.hasOwn(defaults, key)` now, so an unknown
key is skipped whatever it is called — while a REAL option with a wrong type
still throws exactly as before.

Part of #1901.
