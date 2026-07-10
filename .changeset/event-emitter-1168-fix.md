---
"@real-router/core": patch
---

Fix a throwing `onListenerWarn` burning the warn latch (#1168)

In `EventEmitter.on()` the warn latch was set before the (user-supplied)
`onListenerWarn` hook ran, so a throwing hook failed the registration but left
the latch spent — the next successful (W+1)th registration then stayed silent.
The hook is now invoked before the latch is set, so a throw leaves the latch
unspent and the next registration warns as documented.
