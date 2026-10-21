---
"@real-router/svelte": patch
---

`createDirectionTracker` labels a Back pressed while another is held `back` (#2796)

A `popstate` that arrives while a transition is in flight belongs to the traversal a URL plugin starts after that transition. When the held transition left after it, or a navigation to another address was refused in the meantime, that `popstate`'s flag was spent, and its traversal landed labelled `forward`. Each traversal keeps its own flag now: the transition in flight spends only its own, and a refusal spends the waiting one unless it names another address. The same class of defect as #2796.
