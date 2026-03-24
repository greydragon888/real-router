<template>
  <div>
    <h1>Home</h1>
    <p>
      This page is in the main bundle — it loads instantly. Dashboard,
      Analytics, and Settings are lazy-loaded via
      <code>defineAsyncComponent()</code>.
    </p>
    <p>
      Click any link in the sidebar to trigger a dynamic chunk load. The spinner
      shows while the chunk downloads. On second visit, chunks are cached — no
      spinner.
    </p>
  </div>
</template>
