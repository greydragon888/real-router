---
"@real-router/core": minor
---

Support async `subscribeLeave` listeners for exit animations and View Transitions (#391)

Leave listeners move from EventEmitter to separate array with `Promise.allSettled` error handling. Independent listeners survive each other's failures. `AbortSignal` enables cooperative cancellation on concurrent navigation.
