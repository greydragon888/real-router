---
"@real-router/validation-plugin": patch
---

Accept a `Date` in `params` (#2834)

A `Date` is a state value in `@real-router/core`'s types, and the plugin no
longer refuses one anywhere in `params`, a subclass's instance and an Invalid
Date included: `navigate`, `buildPath`, `makeState`, and `start()` through a
decoder that returns a `Date`, accept it as bare core does. The plugin still
refuses a `Date` made in another realm — an iframe's, a `vm` context's — an
object that only looks like a `Date` (one built on `Date.prototype`, or a
`Proxy` over a `Date`) and every other class instance; an instance of an
`Array` subclass is walked as an array, as before.

- On a route without a codec, a `Date` in a path slot now commits without a
  warning: it prints as its JSON text (`/day/%222024-03-15T00:00:00.000Z%22`, an
  Invalid Date as `/day/null`), and a reload reads back a string. Give such a
  route a `decodeParams` / `encodeParams` pair.
- The codec round-trip warning now reaches a `Date` in `params`: a codec that
  prints less than the value holds, such as a day codec on a `Date` with a time,
  is reported as changing the key.
